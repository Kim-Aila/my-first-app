-- PROJ-4: Datenbank-Test für RLS, Trigger, Hierarchie, Kaskade und Zusatzrecht (Adressen, Kontakte,
-- Länder) sowie die Umstellung des Markeninhabers am Artikel.
-- Läuft komplett in einer Transaktion und rollt am Ende zurück (hinterlässt keine Daten).
--   docker exec -i supabase_db_my-first-app psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/proj4_rls.sql
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
  ('a0000000-0000-4000-8000-000000000001', 'P4 T1'),
  ('a0000000-0000-4000-8000-000000000002', 'P4 T2');

insert into auth.users (id, email, aud, role, instance_id)
select u, u || '@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid), -- admin: Adressen write + Zusatzrecht, Kontakte write, Länder write
  ('b0000000-0000-4000-8000-000000000002'::uuid), -- writer: Adressen write (ohne Zusatzrecht), Kontakte write
  ('b0000000-0000-4000-8000-000000000003'::uuid), -- reader: Adressen read, Länder read-only via Adressen
  ('b0000000-0000-4000-8000-000000000004'::uuid), -- artikel: nur Artikelstamm read
  ('b0000000-0000-4000-8000-000000000005'::uuid), -- none
  ('b0000000-0000-4000-8000-000000000006'::uuid), -- other: Admin in T2
  ('b0000000-0000-4000-8000-000000000007'::uuid), -- super-admin
  ('b0000000-0000-4000-8000-000000000008'::uuid)  -- kontaktleser: Kontakte read + Adressen read
) t(u);

insert into public.user_profiles (id, username, email, is_super_admin) values
  ('b0000000-0000-4000-8000-000000000001', 'p4admin', 'p4a@test.local', false),
  ('b0000000-0000-4000-8000-000000000002', 'p4writer', 'p4w@test.local', false),
  ('b0000000-0000-4000-8000-000000000003', 'p4reader', 'p4r@test.local', false),
  ('b0000000-0000-4000-8000-000000000004', 'p4artikel', 'p4ar@test.local', false),
  ('b0000000-0000-4000-8000-000000000005', 'p4none', 'p4n@test.local', false),
  ('b0000000-0000-4000-8000-000000000006', 'p4other', 'p4o@test.local', false),
  ('b0000000-0000-4000-8000-000000000007', 'p4super', 'p4sa@test.local', true),
  ('b0000000-0000-4000-8000-000000000008', 'p4kontakt', 'p4k@test.local', false);

insert into public.user_tenant_access (user_id, tenant_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001');

insert into public.roles (id, tenant_id, name) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Admin'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Verkauf'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Lager'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Artikelpflege'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 'Admin T2'),
  ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Kontakte lesen');

insert into public.role_permissions (role_id, module, maske, access_level, can_toggle_active) values
  ('c0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'adressen', 'write', true),
  ('c0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'kontakte', 'write', false),
  ('c0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'merkmal_laender', 'write', false),
  ('c0000000-0000-4000-8000-000000000002', 'warenwirtschaft', 'adressen', 'write', false),
  ('c0000000-0000-4000-8000-000000000002', 'warenwirtschaft', 'kontakte', 'write', false),
  ('c0000000-0000-4000-8000-000000000003', 'warenwirtschaft', 'adressen', 'read', false),
  ('c0000000-0000-4000-8000-000000000004', 'warenwirtschaft', 'artikelstamm', 'read', false),
  ('c0000000-0000-4000-8000-000000000005', 'warenwirtschaft', 'adressen', 'write', true),
  ('c0000000-0000-4000-8000-000000000005', 'warenwirtschaft', 'kontakte', 'write', false),
  ('c0000000-0000-4000-8000-000000000006', 'warenwirtschaft', 'adressen', 'read', false),
  ('c0000000-0000-4000-8000-000000000006', 'warenwirtschaft', 'kontakte', 'read', false);

insert into public.user_roles (user_id, tenant_id, role_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006');

-- ---- 0. Schema-Grundlagen -------------------------------------------------------------------
select pg_temp.expect_eq(coalesce(to_regclass('public.brand_owners')::text, 'weg'), 'weg', 'Tabelle brand_owners entfernt');
select pg_temp.expect_eq((select count(*)::text from public.role_permissions where maske = 'merkmal_markeninhaber'), '0', 'Markeninhaber-Rechte entfernt');
select pg_temp.expect_fail($q$insert into public.role_permissions (role_id, module, maske, access_level, can_toggle_active)
  values ('c0000000-0000-4000-8000-000000000003', 'warenwirtschaft', 'kontakte', 'read', true)$q$, '23514', 'Zusatzrecht nur mit write');
select pg_temp.expect_eq((select count(*)::text from public.edit_lock_types where resource_type in ('address', 'contact')), '2', 'Sperr-Datensatztypen');

-- Testdaten, die der Superuser anlegt (ohne Client-Kontext → keine Sperrprüfung)
insert into public.countries (id, tenant_id, code, name, is_active) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'de', 'Deutschland', true),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'DE', 'Germany T2', true),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'OLD', 'Altland', false);
select pg_temp.expect_eq((select code from public.countries where id = 'd0000000-0000-4000-8000-000000000001'), 'DE', 'Länderkürzel automatisch groß');

-- ---- 1. Länder -------------------------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001'); -- admin
insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'vae', 'Emirate');
select pg_temp.expect_eq((select code from public.countries where name = 'Emirate'), 'VAE', '3-stelliges Kürzel groß gespeichert');
select pg_temp.expect_fail($q$insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'De', 'Doppelt')$q$, '23505', 'Länderkürzel case-insensitiv eindeutig');
select pg_temp.expect_fail($q$insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'D1', 'Ziffer')$q$, '23514', 'Kürzel mit Ziffer');
select pg_temp.expect_fail($q$insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'DEUT', 'Zu lang')$q$, '23514', 'Kürzel zu lang');
select pg_temp.expect_fail($q$insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'X', 'Zu kurz')$q$, '23514', 'Kürzel zu kurz');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002'); -- writer ohne Länder-Maske
select pg_temp.expect_fail($q$insert into public.countries (tenant_id, code, name) values ('a0000000-0000-4000-8000-000000000001', 'FR', 'Frankreich')$q$, '42501', 'Adressen-Schreiber kann Land nicht anlegen');
select pg_temp.expect_eq((select count(*)::text from public.countries), '3', 'Adressen-Schreiber sieht Länder des eigenen Mandanten');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000005'); -- none
select pg_temp.expect_eq((select count(*)::text from public.countries), '0', 'none sieht keine Länder');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000006'); -- other tenant
select pg_temp.expect_eq((select count(*)::text from public.countries), '1', 'T2-User sieht nur eigene Länder');

-- ---- 2. Adressen anlegen, Nummer, Validierung ------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001'); -- admin
insert into public.addresses (id, tenant_id, address_base, address_suffix, name, code, roles, is_active, address_number, search_text, city)
values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '4711', '0001',
        'Zentrale AG', 'ZEN', array['customer'], false, 'FAKE', 'FAKE', 'Köln');
select pg_temp.expect_eq((select address_number from public.addresses where id = 'e0000000-0000-4000-8000-000000000001'), '4711.0001', 'Adressnummer zusammengesetzt (Client-Wert überschrieben)');
select pg_temp.expect_eq((select is_active::text from public.addresses where id = 'e0000000-0000-4000-8000-000000000001'), 'true', 'neue Adresse ist aktiv');
select pg_temp.expect_eq((select (search_text like '%4711.0001%Zentrale AG%ZEN%Köln%')::text from public.addresses where id = 'e0000000-0000-4000-8000-000000000001'), 'true', 'Suchzeile');

insert into public.addresses (id, tenant_id, address_base, address_suffix, name, code, parent_address_id, roles) values
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '4711', '0002', 'Landesgesellschaft', 'ZEN', 'e0000000-0000-4000-8000-000000000001', array['customer', 'delivery_address']),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '4711', '0003', 'Lieferadresse Nord', null, 'e0000000-0000-4000-8000-000000000002', array['delivery_address']);

select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '4711', '0001', 'Doppelt')$q$, '23505', 'doppelte Adressnummer');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '47a1', '0009', 'X')$q$, '23514', 'Basis nur Ziffern');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '12345678901', '0009', 'X')$q$, '23514', 'Basis max. 10 Stellen');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '4711', '009', 'X')$q$, '23514', 'Kennziffer 4-stellig');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', '  ')$q$, '23514', 'Name Pflicht');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, gln) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', 'X', '123')$q$, '23514', 'GLN 13 Ziffern');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, roles) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', 'X', array['markeninhaber'])$q$, '23514', 'unbekannte Rolle');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, country_id) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', 'X', 'd0000000-0000-4000-8000-000000000002')$q$, '23503', 'Land eines anderen Mandanten');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, country_id) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', 'X', 'd0000000-0000-4000-8000-000000000003')$q$, '23514', 'deaktiviertes Land neu wählen');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, billing_company_id) values ('a0000000-0000-4000-8000-000000000001', '4711', '0009', 'X', 'e0000000-0000-4000-8000-0000000000ff')$q$, '23503', 'Verweis auf nicht existierende Adresse');

-- gleiches Kürzel doppelt ist erlaubt (nur Hinweis)
select pg_temp.expect_eq((select count(*)::text from public.addresses where code = 'ZEN'), '2', 'Kürzel nicht eindeutig erzwungen');

-- ---- 3. Hierarchie: Zyklen, Selbstbezug, Verweise auf sich selbst ----------------------------
-- Änderungen von Clients brauchen die eigene Sperre.
select pg_temp.expect_fail($q$update public.addresses set city = 'X' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'Speichern ohne Sperre');
select out_acquired from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$update public.addresses set parent_address_id = id where id = 'e0000000-0000-4000-8000-000000000001'$q$, '23514', 'Adresse sich selbst übergeordnet');
select pg_temp.expect_fail($q$update public.addresses set parent_address_id = 'e0000000-0000-4000-8000-000000000003' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '23514', 'Zyklus über 3 Ebenen');
select pg_temp.expect_fail($q$update public.addresses set parent_address_id = 'e0000000-0000-4000-8000-000000000002' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '23514', 'Zyklus direkt');
do $$ declare d text; begin
  begin
    update public.addresses set parent_address_id = 'e0000000-0000-4000-8000-000000000003' where id = 'e0000000-0000-4000-8000-000000000001';
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    if d is distinct from 'field:parentAddressId' then raise exception 'FAIL [Zyklus-Feld]: %', d; end if;
  end;
end $$;
-- Verweise auf sich selbst bei Rechnungsempfänger etc. sind erlaubt
update public.addresses set invoice_recipient_id = id, billing_company_id = id, city = 'Köln', phone = '123' where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.expect_eq((select invoice_recipient_id::text from public.addresses where id = 'e0000000-0000-4000-8000-000000000001'), 'e0000000-0000-4000-8000-000000000001', 'Rechnungsempfänger = Adresse selbst erlaubt');
-- Änderung der Hierarchie ohne Zyklus
select out_acquired from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000003');
update public.addresses set parent_address_id = 'e0000000-0000-4000-8000-000000000001' where id = 'e0000000-0000-4000-8000-000000000003';
select pg_temp.expect_eq((select parent_address_id::text from public.addresses where id = 'e0000000-0000-4000-8000-000000000003'), 'e0000000-0000-4000-8000-000000000001', 'Umhängen ohne Zyklus');
update public.addresses set parent_address_id = 'e0000000-0000-4000-8000-000000000002' where id = 'e0000000-0000-4000-8000-000000000003';

-- ---- 4. Status nur über set_address_status ----------------------------------------------------
select pg_temp.expect_fail($q$update public.addresses set is_active = false where id = 'e0000000-0000-4000-8000-000000000001'$q$, '42501', 'direktes Deaktivieren verboten (auch für Admin)');

-- Kontakte vorbereiten (Superuser)
select pg_temp.as_admin();
insert into public.contacts (id, tenant_id, address_id, last_name, first_name) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Zentralmeier', 'Zoe'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Landmeier', 'Lena'),
  ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'Nordmeier', 'Nora');

-- ---- 5. Kontakte: Sicht, Ahnen-Kontakte, Regeln ------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000008'); -- Kontakte read + Adressen read
select pg_temp.expect_eq((select count(*)::text from public.contacts), '3', 'Kontaktleser sieht Kontakte');
select pg_temp.expect_eq((select string_agg(out_level || ':' || out_last_name, ',' order by out_level) from public.address_contacts('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')), '0:Nordmeier,1:Landmeier,2:Zentralmeier', 'Kontakte: eigene + alle übergeordneten');
select pg_temp.expect_eq((select string_agg(out_last_name, ',') from public.address_contacts('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001')), 'Zentralmeier', 'Kontakte untergeordneter Adressen erscheinen nicht');
select pg_temp.expect_fail($q$insert into public.contacts (tenant_id, address_id, last_name) values ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Neu')$q$, '42501', 'Kontaktleser kann nicht anlegen');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000003'); -- reader: Adressen read, Kontakte nicht
select pg_temp.expect_eq((select count(*)::text from public.contacts), '0', 'ohne Kontakte-Recht keine Kontakte');
select pg_temp.expect_eq((select count(*)::text from public.address_contacts('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')), '0', 'Funktion liefert ohne Kontakte-Recht nichts');
select pg_temp.expect_eq((select count(*)::text from public.addresses), '3', 'Adressen-Leser sieht Adressen');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000004'); -- nur Artikelstamm read
select pg_temp.expect_eq((select count(*)::text from public.addresses), '3', 'Artikelstamm-Leser sieht Adressen (Markeninhaber-Auswahl)');
select pg_temp.expect_eq((select count(*)::text from public.contacts), '0', 'Artikelstamm-Leser sieht keine Kontakte');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '1', '0001', 'X')$q$, '42501', 'Artikelstamm-Leser kann keine Adresse anlegen');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000005'); -- none
select pg_temp.expect_eq((select count(*)::text from public.addresses), '0', 'none sieht keine Adressen');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000006'); -- T2
select pg_temp.expect_eq((select count(*)::text from public.addresses), '0', 'T2-User sieht T1-Adressen nicht');
select pg_temp.expect_eq((select count(*)::text from public.contacts), '0', 'T2-User sieht T1-Kontakte nicht');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name) values ('a0000000-0000-4000-8000-000000000001', '1', '0002', 'X')$q$, '42501', 'T2-User kann nicht in T1 anlegen');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, parent_address_id) values ('a0000000-0000-4000-8000-000000000002', '1', '0002', 'X', 'e0000000-0000-4000-8000-000000000001')$q$, '23503', 'T2 kann auf T1-Adresse nicht verweisen');
select pg_temp.expect_eq((select count(*)::text from public.address_subtree('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001')), '0', 'Teilbaum-Funktion respektiert Mandanten/RLS');

-- Kontakte anlegen/ändern (admin: Kontakte write)
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
insert into public.contacts (id, tenant_id, address_id, last_name, is_active) values
  ('f0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Frisch', false);
select pg_temp.expect_eq((select is_active::text from public.contacts where id = 'f0000000-0000-4000-8000-000000000004'), 'true', 'neuer Kontakt ist aktiv');
select pg_temp.expect_fail($q$insert into public.contacts (tenant_id, address_id, last_name) values ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '')$q$, '23514', 'Nachname Pflicht');
select pg_temp.expect_fail($q$insert into public.contacts (tenant_id, address_id, last_name) values ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Quer')$q$, '42501', 'Kontakt für fremden Mandanten');
select pg_temp.expect_fail($q$update public.contacts set last_name = 'Ohne Sperre' where id = 'f0000000-0000-4000-8000-000000000004'$q$, '55P03', 'Kontakt speichern ohne Sperre');
select out_acquired from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'contact', 'f0000000-0000-4000-8000-000000000004');
update public.contacts set last_name = 'Mit Sperre' where id = 'f0000000-0000-4000-8000-000000000004';
select pg_temp.expect_fail($q$update public.contacts set address_id = 'e0000000-0000-4000-8000-000000000002' where id = 'f0000000-0000-4000-8000-000000000004'$q$, '23514', 'Kontakt nicht verschiebbar');
-- fremde Sperre auf dem Kontakt
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select out_acquired::text || ':' || out_holder_username from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'contact', 'f0000000-0000-4000-8000-000000000004')), 'false:p4admin', 'fremde Kontakt-Sperre nennt Halter');
select pg_temp.expect_fail($q$update public.contacts set is_active = false where id = 'f0000000-0000-4000-8000-000000000004'$q$, '55P03', 'Kontakt (de)aktivieren gegen fremde Sperre');
-- Einzelnes (De)Aktivieren eines nicht gesperrten Kontakts mit "Lesen + Bearbeiten" genügt
update public.contacts set is_active = false where id = 'f0000000-0000-4000-8000-000000000002';
select pg_temp.expect_eq((select is_active::text from public.contacts where id = 'f0000000-0000-4000-8000-000000000002'), 'false', 'Kontakt einzeln deaktivierbar ohne Zusatzrecht');
update public.contacts set is_active = true where id = 'f0000000-0000-4000-8000-000000000002';

-- ---- 6. Sperre auf Adressen --------------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002'); -- writer
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000002')), 'true', 'writer sperrt Adresse B');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001'); -- admin hält Sperre auf A
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select out_acquired::text || ':' || out_holder_username from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000001')), 'false:p4admin', 'fremde Adress-Sperre nennt Halter');
select pg_temp.expect_fail($q$update public.addresses set city = 'Fremd' where id = 'e0000000-0000-4000-8000-000000000001'$q$, '55P03', 'Adresse gegen fremde Sperre speichern');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000003'); -- reader darf nicht sperren
select pg_temp.expect_fail($q$select * from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000001')$q$, '42501', 'Leser kann Adresse nicht sperren');
select pg_temp.expect_fail($q$select * from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'contact', 'f0000000-0000-4000-8000-000000000001')$q$, '42501', 'Leser kann Kontakt nicht sperren');

-- ---- 7. Zusatzrecht und Kaskade ----------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002'); -- writer ohne Zusatzrecht
select pg_temp.expect_eq(public.mask_can_toggle('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'adressen')::text, 'false', 'writer ohne Zusatzrecht');
select pg_temp.expect_fail($q$select * from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', false, false)$q$, '42501', 'ohne Zusatzrecht kein Deaktivieren');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000003'); -- reader
select pg_temp.expect_eq(public.mask_can_toggle('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'adressen')::text, 'false', 'reader ohne Zusatzrecht');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000007');
select pg_temp.expect_eq(public.mask_can_toggle('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'adressen')::text, 'true', 'Super-Admin darf immer');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000006'); -- Admin T2 darf nicht in T1
select pg_temp.expect_fail($q$select * from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', false, false)$q$, '42501', 'Admin eines anderen Mandanten');

select pg_temp.as_user('b0000000-0000-4000-8000-000000000001'); -- admin mit Zusatzrecht
select pg_temp.expect_eq(public.mask_can_toggle('a0000000-0000-4000-8000-000000000001', 'warenwirtschaft', 'adressen')::text, 'true', 'admin mit Zusatzrecht');
-- B ist von writer gesperrt: Deaktivieren von A (Wurzel) inkl. Kinder blockiert NICHT durch die Sperre von B
select pg_temp.expect_fail($q$select * from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-0000000000aa', false, false)$q$, 'P0002', 'unbekannte Adresse');
-- Nur C (Blatt) deaktivieren: Kontakt von C mit
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', false, false)), '1/1', 'Blatt deaktivieren inkl. Kontakt');
select pg_temp.expect_eq((select is_active::text from public.contacts where id = 'f0000000-0000-4000-8000-000000000003'), 'false', 'Kontakt der deaktivierten Adresse inaktiv');
-- Aktivieren lässt Kontakte inaktiv
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', true, false)), '1/0', 'Reaktivieren');
select pg_temp.expect_eq((select is_active::text from public.contacts where id = 'f0000000-0000-4000-8000-000000000003'), 'false', 'Kontakte bleiben nach Reaktivierung inaktiv');
-- Kaskade A -> B -> C; B ist von writer gesperrt (Unteradresse blockiert nicht)
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', false, true)), '3/3', 'Kaskade deaktiviert alle Ebenen + Kontakte (trotz Sperre auf B)');
select pg_temp.expect_eq((select count(*)::text from public.addresses where is_active), '0', 'alle Adressen inaktiv');
select pg_temp.expect_eq((select count(*)::text from public.contacts where is_active), '0', 'alle Kontakte inaktiv');
-- Reaktivieren der Wurzel ohne Kinder, dann mit Kindern (auch zuvor inaktive)
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', true, false)), '1/0', 'Wurzel allein reaktivieren');
select pg_temp.expect_eq((select count(*)::text from public.addresses where is_active), '1', 'Kinder bleiben inaktiv bei "Nein"');
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', true, true)), '2/0', 'Reaktivieren mit Kindern');
select pg_temp.expect_eq((select count(*)::text from public.contacts where is_active), '0', 'Kontakte bleiben inaktiv');
-- Sperre auf der gewählten Adresse selbst blockiert (zuerst gibt der Admin seine eigene Sperre auf C frei)
select public.release_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000003');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000002');
select pg_temp.expect_eq((select out_acquired::text from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000003')), 'true', 'writer sperrt C');
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$select * from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', false, false)$q$, '55P03', 'Sperre der gewählten Adresse blockiert');
-- Inaktive Adresse: keine neuen Kontakte, kein neuer Verweis
select pg_temp.expect_eq((select out_addresses || '/' || out_contacts from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', false, false)), '1/0', 'A erneut deaktivieren (Kontakte schon inaktiv)');
select pg_temp.expect_fail($q$insert into public.contacts (tenant_id, address_id, last_name) values ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Spät')$q$, '23514', 'Kontakt zu deaktivierter Adresse');
select pg_temp.expect_fail($q$insert into public.addresses (tenant_id, address_base, address_suffix, name, parent_address_id) values ('a0000000-0000-4000-8000-000000000001', '4711', '0004', 'Unter Inaktiv', 'e0000000-0000-4000-8000-000000000001')$q$, '23514', 'inaktive Adresse als Verweis neu wählen');
select out_addresses from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', true, false);

-- ---- 8. Hilfsfunktionen ------------------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
select pg_temp.expect_eq((select string_agg(out_id::text, ',' order by out_level) from public.address_subtree('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001')), 'e0000000-0000-4000-8000-000000000001,e0000000-0000-4000-8000-000000000002,e0000000-0000-4000-8000-000000000003', 'Teilbaum');
-- C wurde oben deaktiviert? (Kaskade "true,true" aktivierte alle) → Optionen: nur aktive
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', null, false, null, 25)), '3', 'Optionen: alle aktiven');
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', null, true, null, 25)), '2', 'Optionen: nur mit Kürzel');
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', 'landes', false, null, 25)), '1', 'Optionen: Suche (ilike)');
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', '%', false, null, 25)), '0', 'Optionen: Platzhalter % wird nicht als Wildcard gedeutet');
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', null, false, 'e0000000-0000-4000-8000-000000000002', 25)), '1', 'Optionen: Adresse und Nachkommen ausgeblendet');
select pg_temp.expect_eq((select count(*)::text from public.address_options('a0000000-0000-4000-8000-000000000001', null, false, null, 2)), '2', 'Optionen: Trefferlimit');

select pg_temp.expect_eq((select out_exists || ':' || out_suffix from public.next_address_suffix('a0000000-0000-4000-8000-000000000001', '4711')), 'true:0004', 'nächste freie Kennziffer');
select pg_temp.expect_eq((select out_exists::text || ':' || coalesce(out_suffix, 'null') from public.next_address_suffix('a0000000-0000-4000-8000-000000000001', '99')), 'false:null', 'neue Basis');

select pg_temp.expect_eq((select count(*)::text from public.address_code_matches('a0000000-0000-4000-8000-000000000001', 'zen', null)), '2', 'Kürzel-Treffer (case-insensitiv)');
select pg_temp.expect_eq((select count(*)::text from public.address_code_matches('a0000000-0000-4000-8000-000000000001', 'ZEN', 'e0000000-0000-4000-8000-000000000001')), '1', 'Kürzel-Treffer ohne eigene Adresse');

-- ---- 9. Markeninhaber am Artikel ---------------------------------------------------------------
select pg_temp.as_admin();
insert into public.base_articles (id, tenant_id, code, name) values
  ('d2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '1200', 'Tafel');
insert into public.articles (id, tenant_id, base_article_id, base_article_number, kennziffer, brand_owner_id)
values ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001', '12345', '0042', 'e0000000-0000-4000-8000-000000000001');
select pg_temp.expect_eq((select match_code from public.articles where id = 'a1000000-0000-4000-8000-000000000001'), 'ZEN-1200', 'Matchcode nutzt das Adress-Kürzel');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_number, kennziffer, brand_owner_id)
  values ('a0000000-0000-4000-8000-000000000001', '777', '0001', 'e0000000-0000-4000-8000-000000000003')$q$, '23514', 'Markeninhaber ohne Kürzel');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_number, kennziffer, brand_owner_id)
  values ('a0000000-0000-4000-8000-000000000002', '777', '0001', 'e0000000-0000-4000-8000-000000000001')$q$, '23503', 'Markeninhaber eines anderen Mandanten');

-- Kürzeländerung berechnet den Matchcode neu (auch für Nutzer ohne Artikelrechte)
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
select out_acquired from public.acquire_edit_lock('a0000000-0000-4000-8000-000000000001', 'address', 'e0000000-0000-4000-8000-000000000001');
update public.addresses set code = 'NEU' where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.as_admin();
select pg_temp.expect_eq((select match_code from public.articles where id = 'a1000000-0000-4000-8000-000000000001'), 'NEU-1200', 'Matchcode nach Kürzeländerung neu berechnet');

-- Deaktivierte Adresse bleibt am Artikel, ist aber nicht neu wählbar
select pg_temp.as_user('b0000000-0000-4000-8000-000000000001');
select out_addresses from public.set_address_status('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', false, false);
select pg_temp.as_admin();
select pg_temp.expect_eq((select brand_owner_id::text from public.articles where id = 'a1000000-0000-4000-8000-000000000001'), 'e0000000-0000-4000-8000-000000000001', 'deaktivierter Markeninhaber bleibt am Artikel');
select pg_temp.expect_fail($q$insert into public.articles (tenant_id, base_article_number, kennziffer, brand_owner_id)
  values ('a0000000-0000-4000-8000-000000000001', '778', '0001', 'e0000000-0000-4000-8000-000000000001')$q$, '23514', 'deaktivierter Markeninhaber nicht neu wählbar');

-- ---- 10. Kein Löschen ---------------------------------------------------------------------------
select pg_temp.as_user('b0000000-0000-4000-8000-000000000007');
do $$ declare n int; begin
  delete from public.addresses where id = 'e0000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Super-Admin löscht Adresse]: % Zeilen', n; end if;
  delete from public.contacts where id = 'f0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Super-Admin löscht Kontakt]: % Zeilen', n; end if;
  delete from public.countries where id = 'd0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL [Super-Admin löscht Land]: % Zeilen', n; end if;
end $$;

reset role;
select 'ALL OK' as result;
rollback;
