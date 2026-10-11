-- PROJ-5: Datenbank-Test für Lagerbestand (RLS, Sichten, Import mit Vorschau/Übernahme, Lebenszyklus,
-- Prüfung, Versandbuchung, Bereinigung). Läuft in einer Transaktion und rollt am Ende zurück.
--   docker exec -i supabase_db_my-first-app psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/proj5_rls.sql
-- Jeder Test bricht mit einer Exception ab, wenn das Ergebnis nicht stimmt; am Ende steht "ALL OK".
-- Nicht abgedeckt (braucht zwei Sitzungen): die Import-Sperre je Mandant (pg_try_advisory_xact_lock).
begin;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_fail(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAIL [%]: erwartet SQLSTATE %, bekam % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL [%]: erwartet Fehler % — Statement war erfolgreich', p_label, p_state;
end $$;

create function pg_temp.expect_eq(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL [%]: erwartet %, bekam %', p_label, p_expected, p_actual;
  end if;
end $$;

-- Import mit Datensätzen aus einer Kurzschreibweise: ('sscc', 'artikel', menge)
create function pg_temp.rec(p_sscc text, p_article text, p_qty numeric, p_unit text default 'Karton')
returns jsonb language sql as $$
  select jsonb_build_object('sscc', p_sscc, 'article_number', p_article, 'quantity', p_qty,
    'free_quantity', p_qty, 'qs_quantity', 0, 'blocked_quantity', 0, 'qs_and_blocked_quantity', 0,
    'unit', p_unit, 'logistics_center', 'HERFORD', 'stock_group', 'ALL');
$$;

create function pg_temp.imp(p_tenant uuid, p_commit boolean, p_records jsonb, p_excluded jsonb default '[]')
returns jsonb language sql as $$
  select public.stock_import(p_tenant, 'abzug.csv', jsonb_array_length(p_records), p_records, p_excluded,
    '[{"reason":"Testgrund","count":2,"lines":[5,6]}]'::jsonb, '[]'::jsonb, p_commit);
$$;

-- ---- Testdaten (als Superuser) --------------------------------------------------------------
insert into public.tenants (id, name) values
  ('a5000000-0000-4000-8000-000000000001', 'P5 T1'),
  ('a5000000-0000-4000-8000-000000000002', 'P5 T2');

insert into auth.users (id, email, aud, role, instance_id)
select u, u || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from (values
  ('b5000000-0000-4000-8000-000000000001'::uuid), -- writer: Lagerbestand write
  ('b5000000-0000-4000-8000-000000000002'::uuid), -- reader: Lagerbestand read
  ('b5000000-0000-4000-8000-000000000003'::uuid), -- none: nur Artikelstamm read
  ('b5000000-0000-4000-8000-000000000004'::uuid), -- other: Lagerbestand write in T2
  ('b5000000-0000-4000-8000-000000000005'::uuid)  -- super-admin
) t(u);

insert into public.user_profiles (id, username, email, is_super_admin) values
  ('b5000000-0000-4000-8000-000000000001', 'p5writer', 'p5w@test.local', false),
  ('b5000000-0000-4000-8000-000000000002', 'p5reader', 'p5r@test.local', false),
  ('b5000000-0000-4000-8000-000000000003', 'p5none', 'p5n@test.local', false),
  ('b5000000-0000-4000-8000-000000000004', 'p5other', 'p5o@test.local', false),
  ('b5000000-0000-4000-8000-000000000005', 'p5super', 'p5s@test.local', true);

insert into public.user_tenant_access (user_id, tenant_id) values
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000002');

insert into public.roles (id, tenant_id, name) values
  ('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Lager'),
  ('c5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'Einkauf'),
  ('c5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001', 'Artikel'),
  ('c5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000002', 'Lager T2');

insert into public.role_permissions (role_id, module, maske, access_level) values
  ('c5000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'lagerbestand', 'write'),
  ('c5000000-0000-4000-8000-000000000002', 'warenwirtschaft', 'lagerbestand', 'read'),
  ('c5000000-0000-4000-8000-000000000003', 'warenwirtschaft', 'artikelstamm', 'read'),
  ('c5000000-0000-4000-8000-000000000004', 'warenwirtschaft', 'lagerbestand', 'write');

insert into public.user_roles (user_id, tenant_id, role_id) values
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002'),
  ('b5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000003'),
  ('b5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000004');

-- Artikel 12345.0042 existiert im Stamm von T1 (die übrigen Nummern sind "unbekannt").
insert into public.articles (id, tenant_id, base_article_number, kennziffer, name)
values ('a5100000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', '12345', '0042', 'Testtafel');

-- ---- 0. Schema ------------------------------------------------------------------------------
select pg_temp.expect_eq((select count(*)::text from pg_tables where schemaname = 'public'
  and tablename in ('stock_positions', 'stock_imports', 'stock_import_positions') and rowsecurity), '3', 'RLS auf allen Tabellen');
select pg_temp.expect_fail($q$insert into public.stock_positions (tenant_id, sscc, article_number, quantity, free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity)
  values ('a5000000-0000-4000-8000-000000000001', 'abc', '12345.0042', 1, 1, 0, 0, 0)$q$, '23514', 'SSCC nur Ziffern');
select pg_temp.expect_fail($q$insert into public.stock_positions (tenant_id, sscc, article_number, quantity, free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity)
  values ('a5000000-0000-4000-8000-000000000001', '1', '12345.451', 1, 1, 0, 0, 0)$q$, '23514', 'Artikelnummer 4-stellige Kennziffer');
select pg_temp.expect_fail($q$insert into public.stock_positions (tenant_id, sscc, article_number, quantity, free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity)
  values ('a5000000-0000-4000-8000-000000000001', '1', '12345.0042', -1, 1, 0, 0, 0)$q$, '23514', 'Menge nicht negativ');

-- ---- 1. Rechte: Import nur mit write, Vorschau schreibt nichts --------------------------------
select pg_temp.as_user('b5000000-0000-4000-8000-000000000002'); -- reader
select pg_temp.expect_fail($q$select pg_temp.imp('a5000000-0000-4000-8000-000000000001', false, jsonb_build_array(pg_temp.rec('1', '12345.0042', 1)))$q$,
  '42501', 'Leser darf keine Vorschau');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000003'); -- none
select pg_temp.expect_fail($q$select pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(pg_temp.rec('1', '12345.0042', 1)))$q$,
  '42501', 'Nutzer ohne Maske darf nicht importieren');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000004'); -- other tenant
select pg_temp.expect_fail($q$select pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(pg_temp.rec('1', '12345.0042', 1)))$q$,
  '42501', 'Fremder Mandant darf nicht importieren');

select pg_temp.as_user('b5000000-0000-4000-8000-000000000001'); -- writer
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', false, jsonb_build_array(
    pg_temp.rec('100', '12345.0042', 10), pg_temp.rec('100', '99999.0001', 5), pg_temp.rec('200', '12345.0042', 20)));
  perform pg_temp.expect_eq(r #>> '{counts,new}', '3', 'Vorschau: 3 neu');
  perform pg_temp.expect_eq(r ->> 'skippedCount', '2', 'Vorschau: übersprungene Zeilen');
  perform pg_temp.expect_eq(r ->> 'unknownArticles', '["99999.0001"]', 'Vorschau: unbekannte Artikel');
end $$;
select pg_temp.as_admin();
select pg_temp.expect_eq((select count(*)::text from public.stock_positions), '0', 'Vorschau speichert keine Positionen');
select pg_temp.expect_eq((select count(*)::text from public.stock_imports), '0', 'Vorschau speichert kein Protokoll');

-- ---- 2. Erste Übernahme ----------------------------------------------------------------------
select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(
    pg_temp.rec('100', '12345.0042', 10), pg_temp.rec('100', '99999.0001', 5), pg_temp.rec('200', '12345.0042', 20),
    pg_temp.rec('300', '12345.0042', 7), pg_temp.rec('400', '12345.0042', 3)));
  perform pg_temp.expect_eq(r #>> '{counts,new}', '5', 'Import 1: 5 neu');
  perform pg_temp.expect_eq(r #>> '{counts,missing}', '0', 'Import 1: nichts fehlt');
end $$;

select pg_temp.as_admin();
select pg_temp.expect_eq((select count(*)::text from public.stock_positions where status = 'in_stock'), '5', 'Import 1: Positionen im Lager');
select pg_temp.expect_eq((select count(*)::text from public.stock_imports), '1', 'Import 1: Protokoll');
select pg_temp.expect_eq((select user_name from public.stock_imports), 'p5writer', 'Import 1: Nutzername im Protokoll');
select pg_temp.expect_eq((select count(*)::text from public.stock_import_positions), '5', 'Import 1: Verlauf je Position');
select pg_temp.expect_eq((select unknown_articles::text from public.stock_imports), '["99999.0001"]', 'Import 1: unbekannte Artikel gespeichert');

-- Sichten für Leser (ohne Artikelstamm-Recht)
select pg_temp.as_user('b5000000-0000-4000-8000-000000000002'); -- reader
select pg_temp.expect_eq((select count(*)::text from public.stock_positions), '5', 'Leser sieht Positionen');
select pg_temp.expect_eq((select count(*)::text from public.stock_imports), '1', 'Leser sieht Protokoll');
select pg_temp.expect_eq((select count(*)::text from public.stock_position_list where tenant_id = 'a5000000-0000-4000-8000-000000000001'), '5', 'Leser sieht Sicht LHM-Liste');
select pg_temp.expect_eq((select article_name from public.stock_position_list where sscc = '200'), 'Testtafel', 'Artikelname über Artikelnummer (ohne Artikelstamm-Recht)');
select pg_temp.expect_eq((select coalesce(article_id::text, 'null') from public.stock_position_list where article_number = '99999.0001'), 'null', 'Unbekannter Artikel ohne Verweis');
select pg_temp.expect_eq((select is_mixed_pallet::text from public.stock_position_list where sscc = '100' and article_number = '12345.0042'), 'true', 'Mischpalette abgeleitet');
select pg_temp.expect_eq((select is_mixed_pallet::text from public.stock_position_list where sscc = '200'), 'false', 'Keine Mischpalette');
select pg_temp.expect_eq((select stock::text from public.stock_by_article where article_number = '12345.0042'), '40.000', 'Bestand je Artikel summiert');
select pg_temp.expect_eq((select article_name from public.stock_by_article where article_number = '12345.0042'), 'Testtafel', 'Bestand je Artikel: Name');
select pg_temp.expect_eq((select count(*)::text from public.stock_by_article), '2', 'Bestand je Artikel: 2 Artikel');

-- Schreiben ist für Clients immer gesperrt (auch mit write-Recht)
select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$update public.stock_positions set quantity = 999$q$, '42501', 'Kein direktes UPDATE');
select pg_temp.expect_fail($q$delete from public.stock_positions$q$, '42501', 'Kein direktes DELETE');
select pg_temp.expect_fail($q$insert into public.stock_positions (tenant_id, sscc, article_number, quantity, free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity)
  values ('a5000000-0000-4000-8000-000000000001', '9', '12345.0042', 1, 1, 0, 0, 0)$q$, '42501', 'Kein direktes INSERT');
select pg_temp.expect_fail($q$update public.stock_imports set file_name = 'x'$q$, '42501', 'Protokoll nicht änderbar');

-- Mandantentrennung und fehlende Rechte beim Lesen
select pg_temp.as_user('b5000000-0000-4000-8000-000000000004'); -- other tenant
select pg_temp.expect_eq((select count(*)::text from public.stock_positions), '0', 'Fremder Mandant sieht keine Positionen');
select pg_temp.expect_eq((select count(*)::text from public.stock_position_list), '0', 'Fremder Mandant sieht die Sicht nicht');
select pg_temp.expect_eq((select count(*)::text from public.stock_by_article), '0', 'Fremder Mandant sieht keine Summen');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000003'); -- none
select pg_temp.expect_eq((select count(*)::text from public.stock_positions), '0', 'Ohne Maske keine Positionen');
select pg_temp.expect_eq((select count(*)::text from public.stock_position_list), '0', 'Ohne Maske keine Sicht');
select pg_temp.expect_eq((select count(*)::text from public.stock_imports), '0', 'Ohne Maske kein Protokoll');
select pg_temp.expect_eq((select count(*)::text from public.stock_import_positions), '0', 'Ohne Maske kein Verlauf');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000005'); -- super admin
select pg_temp.expect_eq((select count(*)::text from public.stock_position_list), '5', 'Super-Admin sieht Positionen');

-- Dieselbe SSCC darf in einem anderen Mandanten vorkommen
select pg_temp.as_user('b5000000-0000-4000-8000-000000000004');
do $$ begin perform pg_temp.imp('a5000000-0000-4000-8000-000000000002', true, jsonb_build_array(pg_temp.rec('100', '12345.0042', 1))); end $$;
select pg_temp.as_admin();
select pg_temp.expect_eq((select count(*)::text from public.stock_positions where sscc = '100'), '3', 'Gleiche SSCC in zwei Mandanten');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000004');
select pg_temp.expect_eq((select coalesce(article_id::text, 'null') from public.stock_position_list where tenant_id = 'a5000000-0000-4000-8000-000000000002'), 'null', 'Artikelzuordnung bleibt im Mandanten');
select pg_temp.as_admin();

-- ---- 3. Zweiter Abzug: geändert / unverändert / fehlend / Duplikat-Ausschluss -----------------
-- 100/12345 unverändert, 100/99999 geändert (5→6), 200 fehlt, 300 fehlt, 400 fehlt (Duplikat-Fehler → bleibt), 500 neu
select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', false, jsonb_build_array(
    pg_temp.rec('100', '12345.0042', 10), pg_temp.rec('100', '99999.0001', 6), pg_temp.rec('500', '12345.0042', 9)),
    jsonb_build_array(jsonb_build_object('sscc', '400', 'article_number', '12345.0042')));
  perform pg_temp.expect_eq(r #>> '{counts,new}' || ',' || (r #>> '{counts,changed}') || ',' || (r #>> '{counts,unchanged}') || ',' || (r #>> '{counts,missing}') || ',' || (r #>> '{counts,reappeared}'),
    '1,1,1,2,0', 'Vorschau 2: neu,geändert,unverändert,fehlend,wieder aufgetaucht');
end $$;
select pg_temp.as_admin();
select pg_temp.expect_eq((select count(*)::text from public.stock_positions where tenant_id = 'a5000000-0000-4000-8000-000000000001' and status = 'in_stock'), '5', 'Vorschau 2 ändert nichts');

select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(
    pg_temp.rec('100', '12345.0042', 10), pg_temp.rec('100', '99999.0001', 6), pg_temp.rec('500', '12345.0042', 9)),
    jsonb_build_array(jsonb_build_object('sscc', '400', 'article_number', '12345.0042')));
  perform pg_temp.expect_eq(r #>> '{counts,new}', '1', 'Import 2: neu');
  perform pg_temp.expect_eq(r #>> '{counts,missing}', '2', 'Import 2: fehlend');
end $$;
select pg_temp.as_admin();
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', 'Fehlende Position → Fehlt, ungeprüft');
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '400' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'in_stock', 'Ausgeschlossenes Duplikat bleibt im Lager');
select pg_temp.expect_eq((select quantity::text from public.stock_positions where sscc = '100' and article_number = '99999.0001' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), '6.000', 'Geänderte Menge übernommen');
select pg_temp.expect_eq((select count(*)::text from public.stock_import_positions ip join public.stock_positions p on p.id = ip.position_id where p.sscc = '100' and p.article_number = '12345.0042' and p.tenant_id = 'a5000000-0000-4000-8000-000000000001'), '2', 'Verlauf: unveränderte Position kam in 2 Importen vor');
select pg_temp.expect_eq((select count(*)::text from public.stock_import_positions ip join public.stock_positions p on p.id = ip.position_id where p.sscc = '200' and p.tenant_id = 'a5000000-0000-4000-8000-000000000001'), '1', 'Verlauf: fehlende Position nicht in Import 2');
select pg_temp.as_user('b5000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select stock::text from public.stock_by_article where article_number = '12345.0042' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), '22.000', 'Summen ohne fehlende Positionen (10+3+9)');
select pg_temp.as_admin();
select pg_temp.expect_eq((select count(*)::text from public.stock_imports where tenant_id = 'a5000000-0000-4000-8000-000000000001'), '2', 'Zwei Importe protokolliert');

-- ---- 4. Prüfung und Versandbuchung ------------------------------------------------------------
select pg_temp.as_user('b5000000-0000-4000-8000-000000000002'); -- reader
select pg_temp.expect_fail($q$select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', null)$q$,
  '42501', 'Leser darf nicht prüfen');
select pg_temp.expect_fail($q$select public.stock_ship_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked')$q$,
  '42501', 'Leser darf nicht Versand buchen');

select pg_temp.as_user('b5000000-0000-4000-8000-000000000001'); -- writer
select pg_temp.expect_eq((select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', '  ok, umgelagert  ')), 'ok', 'Prüfung gelingt');
select pg_temp.expect_eq((select status || '|' || check_remark || '|' || coalesce(checked_by_name, '') from public.stock_position_list where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'),
  'missing_checked|ok, umgelagert|p5writer', 'Prüfinfo gespeichert (Bemerkung getrimmt, Name über Sicht)');
select pg_temp.expect_eq((select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', null)), 'conflict', 'Zweite Prüfung → Konflikt');
select pg_temp.expect_eq((select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '100' and article_number = '12345.0042' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'in_stock', null)), 'conflict', 'Prüfen einer Position im Lager → Konflikt');
select pg_temp.expect_eq((select public.stock_check_position('a5000000-0000-4000-8000-000000000001', 'a5ffffff-ffff-4fff-8fff-ffffffffffff', 'missing_unchecked', null)), 'not_found', 'Unbekannte Position');
select pg_temp.expect_eq((select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '300' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', null)), 'ok', 'Prüfung ohne Bemerkung');
select pg_temp.expect_fail($q$select public.stock_check_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '400' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'in_stock', repeat('x', 501))$q$,
  '22023', 'Bemerkung zu lang');

-- Fremder Mandant: Position von T1 ist für T2-Nutzer nicht erreichbar
select pg_temp.as_user('b5000000-0000-4000-8000-000000000004');
select pg_temp.expect_eq((select public.stock_ship_position('a5000000-0000-4000-8000-000000000002',
  (select id from public.stock_positions where sscc = '300' and tenant_id = 'a5000000-0000-4000-8000-000000000001' limit 1), 'missing_checked')), 'not_found', 'Fremde Position nicht buchbar');
select pg_temp.expect_fail($q$select public.stock_ship_position('a5000000-0000-4000-8000-000000000001', gen_random_uuid(), 'missing_unchecked')$q$,
  '42501', 'Fremder Mandant darf nicht buchen');

select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
-- 200 (geprüft) und 300 (geprüft) werden versendet gebucht; 200 nach der Prüfung, Status "Versendet" mit Nutzer
select pg_temp.expect_eq((select public.stock_ship_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_checked')), 'ok', 'Versand nach Prüfung buchbar');
select pg_temp.expect_eq((select public.stock_ship_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_checked')), 'conflict', 'Doppelte Versandbuchung → Konflikt');
select pg_temp.expect_eq((select status || '|' || coalesce(shipped_by_name, '') from public.stock_position_list where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'shipped|p5writer', 'Versandinfo gespeichert');
select pg_temp.expect_eq((select public.stock_ship_position('a5000000-0000-4000-8000-000000000001',
  (select id from public.stock_positions where sscc = '100' and article_number = '12345.0042' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'in_stock')), 'conflict', 'Position im Lager nicht als versendet buchbar');

-- ---- 5. Dritter Abzug: Wiederauftauchen, Versendet kommt wieder, Versendet fehlt ----------------
-- 300 (geprüft, fehlt) taucht wieder auf (Menge neu); 200 (versendet) taucht wieder auf → Fehler; 400 fehlt jetzt
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(
    pg_temp.rec('100', '12345.0042', 10), pg_temp.rec('100', '99999.0001', 6), pg_temp.rec('500', '12345.0042', 9),
    pg_temp.rec('300', '12345.0042', 8), pg_temp.rec('200', '12345.0042', 20)));
  perform pg_temp.expect_eq(r #>> '{counts,reappeared}', '1', 'Import 3: wieder aufgetaucht');
  perform pg_temp.expect_eq(r #>> '{counts,missing}', '1', 'Import 3: 400 fehlt');
  perform pg_temp.expect_eq(r #>> '{counts,new}', '0', 'Import 3: nichts neu (Versendet zählt nicht)');
  perform pg_temp.expect_eq(jsonb_array_length(r -> 'errors')::text, '1', 'Import 3: ein Fehler');
  perform pg_temp.expect_eq(r #>> '{errors,0,sscc}', '200', 'Import 3: Fehler nennt SSCC');
  perform pg_temp.expect_eq(r #>> '{errors,0,articleNumber}', '12345.0042', 'Import 3: Fehler nennt Artikel');
end $$;
select pg_temp.as_admin();
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'shipped', 'Versendet bleibt versendet');
select pg_temp.expect_eq((select status || '|' || quantity::text || '|' || coalesce(check_remark, 'null') from public.stock_positions where sscc = '300' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'in_stock|8.000|null', 'Wieder aufgetaucht: im Lager, Fehlt-Markierung entfällt');
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '400' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', 'Neu fehlende Position');
select pg_temp.expect_eq((select max(error_count)::text from public.stock_imports where tenant_id = 'a5000000-0000-4000-8000-000000000001'), '1', 'Fehlerzahl im Protokoll');

-- Versendet fehlt im nächsten Abzug → bleibt versendet, wird nicht "fehlt"
select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
do $$
declare r jsonb;
begin
  r := pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(pg_temp.rec('100', '12345.0042', 10)));
  perform pg_temp.expect_eq(r #>> '{counts,missing}', '3', 'Import 4: 99999, 500, 300 fehlen');
end $$;
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '200' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'shipped', 'Versendet bleibt versendet bei fehlendem Abzug');
select pg_temp.expect_eq((select status from public.stock_positions where sscc = '400' and tenant_id = 'a5000000-0000-4000-8000-000000000001'), 'missing_unchecked', 'Bereits fehlende Position bleibt unverändert');

-- Leerer Abzug (0 Datensätze) markiert alles als fehlend (die Vorschau warnt davor)
select pg_temp.expect_eq((pg_temp.imp('a5000000-0000-4000-8000-000000000001', false, '[]'::jsonb)) #>> '{counts,missing}', '1', 'Leerer Abzug: verbleibende Position wäre fehlend');

-- Doppelte Position in den Daten → Unique-Verletzung (die Route verhindert das vorher)
select pg_temp.expect_fail($q$select pg_temp.imp('a5000000-0000-4000-8000-000000000001', true, jsonb_build_array(pg_temp.rec('7', '12345.0042', 1), pg_temp.rec('7', '12345.0042', 2)))$q$,
  '23505', 'Doppelte Schlüssel in p_records');

-- ---- 6. Bereinigung -----------------------------------------------------------------------------
select pg_temp.as_admin();
update public.stock_positions set updated_at = now() - interval '6 years'
  where tenant_id = 'a5000000-0000-4000-8000-000000000001' and sscc in ('200', '400', '100');  -- shipped, fehlt, im Lager
update public.stock_positions set updated_at = now() - interval '4 years'
  where tenant_id = 'a5000000-0000-4000-8000-000000000001' and sscc = '300';
select pg_temp.as_user('b5000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$select public.stock_cleanup()$q$, '42501', 'Clients dürfen nicht bereinigen');
select pg_temp.as_admin();
-- Betroffen: 200 (versendet), 400 (fehlt) und 100/99999 (fehlt); 100/12345 ist "Im Lager" und bleibt.
select pg_temp.expect_eq(public.stock_cleanup()::text, '3', 'Bereinigung entfernt versendet + fehlend (>5 Jahre), nicht "Im Lager"');
select pg_temp.expect_eq((select count(*)::text from public.stock_positions where tenant_id = 'a5000000-0000-4000-8000-000000000001' and sscc in ('200', '400')), '0', 'Alte Positionen entfernt');
select pg_temp.expect_eq((select count(*)::text from public.stock_positions where tenant_id = 'a5000000-0000-4000-8000-000000000001' and sscc in ('100', '300')), '2', 'Jüngere und Im-Lager-Positionen bleiben');
select pg_temp.expect_eq((select count(*)::text from public.stock_import_positions where position_id not in (select id from public.stock_positions)), '0', 'Verlauf wird mitbereinigt');
select pg_temp.expect_eq((select count(*)::text from public.stock_imports where tenant_id = 'a5000000-0000-4000-8000-000000000001'), '4', 'Protokoll bleibt erhalten');

reset role;
select 'ALL OK' as result;
rollback;
