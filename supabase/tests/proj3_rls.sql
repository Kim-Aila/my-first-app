-- PROJ-3: Datenbank-Test für RLS, Berechnungs-Trigger und Bearbeitungssperre.
-- Läuft komplett in einer Transaktion und rollt am Ende zurück (hinterlässt keine Daten).
--   docker exec -i supabase_db_my-first-app psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/proj3_rls.sql
-- Jeder Test bricht mit einer Exception ab, wenn das Ergebnis nicht stimmt; am Ende steht "ALL OK".
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

-- erwartet, dass `p_sql` mit SQLSTATE `p_state` scheitert
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

-- ---- Testdaten (als Superuser) --------------------------------------------------------------
insert into public.tenants (id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'T1 Test'),
  ('a0000000-0000-4000-8000-000000000002', 'T2 Test');

insert into auth.users (id, email, aud, role, instance_id)
select u, u || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid), -- writer (Artikelstamm write)
  ('b0000000-0000-4000-8000-000000000002'::uuid), -- writer2 (Artikelstamm write)
  ('b0000000-0000-4000-8000-000000000003'::uuid), -- reader (Artikelstamm read)
  ('b0000000-0000-4000-8000-000000000004'::uuid), -- none (kein Recht)
  ('b0000000-0000-4000-8000-000000000005'::uuid), -- other (T2 write)
  ('b0000000-0000-4000-8000-000000000006'::uuid), -- season-only (nur Maske Saison write)
  ('b0000000-0000-4000-8000-000000000007'::uuid)  -- super-admin
) t(u);

insert into public.user_profiles (id, username, email, is_super_admin) values
  ('b0000000-0000-4000-8000-000000000001', 'writer', 'w1@test.local', false),
  ('b0000000-0000-4000-8000-000000000002', 'writer2', 'w2@test.local', false),
  ('b0000000-0000-4000-8000-000000000003', 'reader', 'r@test.local', false),
  ('b0000000-0000-4000-8000-000000000004', 'none', 'n@test.local', false),
  ('b0000000-0000-4000-8000-000000000005', 'other', 'o@test.local', false),
  ('b0000000-0000-4000-8000-000000000006', 'seasononly', 's@test.local', false),
  ('b0000000-0000-4000-8000-000000000007', 'superadmin', 'sa@test.local', true);

insert into public.user_tenant_access (user_id, tenant_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001');

insert into public.roles (id, tenant_id, name) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Einkauf'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Lager'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'Einkauf T2'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Saison-Pflege');

insert into public.role_permissions (role_id, module, maske, access_level) values
  ('c0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'artikelstamm', 'write'),
  ('c0000000-0000-4000-8000-000000000002', 'warenwirtschaft', 'artikelstamm', 'read'),
  ('c0000000-0000-4000-8000-000000000003', 'warenwirtschaft', 'artikelstamm', 'write'),
  ('c0000000-0000-4000-8000-000000000004', 'warenwirtschaft', 'merkmal_saison', 'write');

insert into public.user_roles (user_id, tenant_id, role_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004');

-- Merkmale (Superuser): Saison 3, Typ 4, Basisartikel 1200; T2: eigene Saison
insert into public.seasons (id, tenant_id, code, name, commodity_digit) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'SOM', 'Sommer', 3),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'SOM', 'Sommer T2', 5);
insert into public.article_types (id, tenant_id, code, name, commodity_digit) values
  ('d1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'FW', 'Fertigware', 4);
insert into public.base_articles (id, tenant_id, code, name) values
  ('d2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '1200', 'Tafelschokolade'),
  ('d2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '1300', 'Praline');
insert into public.flavors (id, tenant_id, code, name, is_active) values
  ('d3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'OLD', 'Alt', false);

-- ---- 1. Berechnung + Anlegen (writer) -------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
insert into public.articles (id, tenant_id, base_article_id, kennziffer, season_id, article_type_id, weight, tara)
values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001', '0042',
        'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 100.5, 10);

select pg_temp.expect_eq((select article_number from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), '12000042', 'Artikelnummer');
select pg_temp.expect_eq((select commodity_group from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), '340', 'Warengruppe');
select pg_temp.expect_eq((select gross_weight::text from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), '110.500', 'Bruttogewicht');

-- Client-Werte für berechnete Felder werden überschrieben
insert into public.articles (id, tenant_id, base_article_id, kennziffer, article_number, commodity_group)
values ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000002', '0001', 'FAKE', '999');
select pg_temp.expect_eq((select article_number || '/' || commodity_group from public.articles where id = 'e0000000-0000-4000-8000-000000000002'), '13000001/000', 'Berechnung überschreibt Client-Werte');

-- ---- 2. Eindeutigkeit, Mandantentreue, Löschen ----------------------------------------------
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0042')$q$, '23505', 'doppelte Artikelnummer');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer, season_id)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0077', 'd0000000-0000-4000-8000-000000000002')$q$, '23503', 'Saison eines anderen Mandanten');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '12a4')$q$, '23514', 'Kennziffer nicht 4-stellig');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer, flavor_id)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0078', 'd3000000-0000-4000-8000-000000000001')$q$, '23514', 'deaktiviertes Merkmal neu verwenden');

do $$ declare n int; begin
  delete from public.articles where id = 'e0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Löschen]: % Zeilen gelöscht', n; end if;
end $$;

-- ---- 3. Lesen / Schreiben je Stufe und Mandant ----------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000003'); -- reader
select pg_temp.expect_eq((select count(*)::text from public.articles), '2', 'reader sieht Artikel');
select pg_temp.expect_eq((select count(*)::text from public.seasons), '1', 'reader sieht Merkmale (via Artikelstamm)');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0099')$q$, '42501', 'reader kann nicht anlegen');
do $$ declare n int; begin
  update public.articles set name = 'X' where id = 'e0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [reader update]: % Zeilen geändert', n; end if;
end $$;
select pg_temp.expect_fail($q$insert into public.seasons (tenant_id, code, name, commodity_digit)
  values ('a0000000-0000-4000-8000-000000000001', 'WIN', 'Winter', 1)$q$, '42501', 'reader kann Merkmal nicht anlegen');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000004'); -- none
select pg_temp.expect_eq((select count(*)::text from public.articles), '0', 'none sieht nichts');
select pg_temp.expect_eq((select count(*)::text from public.seasons), '0', 'none sieht keine Merkmale');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000005'); -- other tenant
select pg_temp.expect_eq((select count(*)::text from public.articles), '0', 'T2-User sieht T1-Artikel nicht');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_id, kennziffer)
  values ('a0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '0098')$q$, '42501', 'T2-User kann nicht in T1 anlegen');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000007'); -- super-admin
select pg_temp.expect_eq(public.mask_access_level('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'artikelstamm'), 'write', 'Super-Admin = write');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000003');
select pg_temp.expect_eq(public.mask_access_level('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'artikelstamm'), 'read', 'reader = read');
select pg_temp.expect_eq(coalesce(public.mask_access_level('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'merkmal_saison'), 'null'), 'null', 'reader ohne Saison-Maske');

-- ---- 4. Bearbeitungssperre -------------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000003'); -- reader darf nicht sperren
select pg_temp.expect_fail($q$select * from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')$q$, '42501', 'reader kann nicht sperren');
select pg_temp.expect_fail($q$select * from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'unbekannt', 'e0000000-0000-4000-8000-000000000001')$q$, '22023', 'unbekannter Typ');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000001'); -- writer
-- ohne Sperre: Inhaltsänderung abgelehnt
select pg_temp.expect_fail($q$update public.articles set name = 'Ohne Sperre' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'Speichern ohne Sperre');
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'true', 'writer sperrt');
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'true', 'writer verlängert eigene Sperre');
update public.articles set name = 'Mit Sperre' where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.expect_eq((select name from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), 'Mit Sperre', 'Speichern mit eigener Sperre');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000002'); -- writer2 gegen fremde Sperre
select pg_temp.expect_eq((select out_acquired::text || ':' || out_holder_username from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'false:writer', 'fremde Sperre nennt Halter');
select pg_temp.expect_eq((select out_username from public.get_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'writer', 'get_edit_lock nennt Halter');
select pg_temp.expect_fail($q$update public.articles set name = 'Fremd' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'Speichern gegen fremde Sperre');
select pg_temp.expect_fail($q$update public.articles set is_active = false where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'Deaktivieren gegen fremde Sperre');
do $$ declare n int; begin
  select count(*) into n from public.edit_locks;
  if n <> 0 then raise exception 'FAIL [edit_locks direkt lesbar]: % Zeilen', n; end if;
end $$;
select pg_temp.expect_fail($q$insert into public.edit_locks (tenant_id, resource_type, resource_id, user_id, expires_at)
  values ('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', now() + interval '1 hour')$q$, '42501', 'Sperren nicht direkt schreibbar');
-- fremde Sperre nicht freigebbar
select public.release_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001');
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'false', 'fremde Sperre bleibt nach release');

-- Ablauf: Sperre läuft ab → writer2 übernimmt
select pg_temp.as_admin();
update public.edit_locks set expires_at = now() - interval '1 minute';
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001')), 'true', 'abgelaufene Sperre wird übernommen');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$update public.articles set name = 'Alter Halter' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'alter Halter kann nicht mehr speichern');

-- Freigabe durch den Halter, danach darf Status geändert werden (ohne eigene Sperre)
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select public.release_edit_lock('a0000000-0000-4000-8000-000000000001', 'article', 'e0000000-0000-4000-8000-000000000001');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
update public.articles set is_active = false where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.expect_eq((select is_active::text from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), 'false', 'Deaktivieren ohne fremde Sperre');

-- ---- 5. Neuberechnung bei Merkmal-Änderung (nur Merkmal-Recht, kein Artikelrecht) -------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000006'); -- season-only
update public.seasons set commodity_digit = 7 where id = 'd0000000-0000-4000-8000-000000000001';
select pg_temp.as_admin();
select pg_temp.expect_eq((select commodity_group from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), '740', 'Warengruppe nach Saison-Ziffer neu berechnet');

-- Artikel-Schreiber ohne Basisartikel-Maske ändert 0 Zeilen; Super-Admin darf, Artikelnummern folgen
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
do $$ declare n int; begin
  update public.base_articles set code = '9999' where id = 'd2000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Basisartikel ohne Maske]: % Zeilen geändert', n; end if;
end $$;
select pg_temp.as_user('b0000000-0000-4000-8000-000000000007');
update public.base_articles set code = '1250' where id = 'd2000000-0000-4000-8000-000000000001';
select pg_temp.as_admin();
select pg_temp.expect_eq((select article_number from public.articles where id = 'e0000000-0000-4000-8000-000000000001'), '12500042', 'Artikelnummer nach Basisartikel-Nummer neu berechnet');

-- Super-Admin darf ebenfalls nichts löschen (keine DELETE-Policy)
select pg_temp.as_user('b0000000-0000-4000-8000-000000000007');
do $$ declare n int; begin
  delete from public.seasons where id = 'd0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Super-Admin löscht Merkmal]: % Zeilen', n; end if;
end $$;

reset role;
select 'ALL OK' as result;
rollback;
