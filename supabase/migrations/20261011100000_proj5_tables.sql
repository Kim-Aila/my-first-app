-- PROJ-5: Lagerbestand (Lagerebene) — Tabellen und Fachlogik (Import, Prüfung, Versandbuchung,
-- 5-Jahres-Bereinigung). RLS, Sichten und Rechte folgen in 20261011100100_proj5_rls.sql.
--
-- Entscheidungen (siehe Tech Design in features/PROJ-5-lager.md):
--  * Kein gespeicherter Verweis auf den Artikelstamm: die Zuordnung entsteht in den Sichten über
--    (Mandant, Artikelnummer). Mischpalette und Bestandssummen werden abgeleitet.
--  * Clients schreiben nie direkt: Import, Prüfung und Versandbuchung laufen ausschließlich über die
--    SECURITY-DEFINER-Funktionen unten (sie prüfen Maskenrecht "Lagerbestand" = write).
--  * Import = EINE Transaktion mit Import-Sperre je Mandant; Vorschau (p_commit = false) rechnet
--    mit derselben Funktion, schreibt aber nichts.
--  * Mengen als numeric(18,3).

-- ---------------------------------------------------------------------------------------------
-- Import-Protokoll
-- ---------------------------------------------------------------------------------------------
create table public.stock_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references public.user_profiles (id) on delete set null,
  user_name text,
  file_name text not null check (char_length(file_name) between 1 and 255),
  created_at timestamptz not null default now(),
  record_count integer not null check (record_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  reappeared_count integer not null default 0 check (reappeared_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  -- Details des Ergebnisses (übersprungene Zeilen mit Grund, Fehler mit SSCC, unbekannte Artikel)
  skipped jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  unknown_articles jsonb not null default '[]'::jsonb,
  unique (id, tenant_id)
);
create index idx_stock_imports_tenant_created on public.stock_imports (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- LHM-Positionen. Schlüssel: Mandant + SSCC + (umgewandelte) Artikelnummer.
-- Werden nie von Clients gelöscht; die Bereinigung (`stock_cleanup`) entfernt nach 5 Jahren.
-- ---------------------------------------------------------------------------------------------
create table public.stock_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sscc text not null check (sscc ~ '^[0-9]{1,30}$'),
  article_number text not null check (article_number ~ '^[0-9]{1,10}\.[0-9]{4}$'),

  quantity numeric(18, 3) not null check (quantity >= 0),
  free_quantity numeric(18, 3) not null check (free_quantity >= 0),
  qs_quantity numeric(18, 3) not null check (qs_quantity >= 0),
  blocked_quantity numeric(18, 3) not null check (blocked_quantity >= 0),
  qs_and_blocked_quantity numeric(18, 3) not null check (qs_and_blocked_quantity >= 0),
  unit text check (char_length(unit) <= 100),
  logistics_center text check (char_length(logistics_center) <= 100),
  stock_group text check (char_length(stock_group) <= 100),

  status text not null default 'in_stock'
    check (status in ('in_stock', 'missing_unchecked', 'missing_checked', 'shipped')),
  checked_by uuid references public.user_profiles (id) on delete set null,
  checked_at timestamptz,
  check_remark text check (char_length(check_remark) <= 500),
  shipped_by uuid references public.user_profiles (id) on delete set null,
  shipped_at timestamptz,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Basis der 5-Jahres-Frist: letzte inhaltliche Änderung (nicht jedes Wiedersehen im Abzug).
  updated_at timestamptz not null default now(),
  last_import_id uuid references public.stock_imports (id) on delete set null,

  unique (id, tenant_id),
  unique (tenant_id, sscc, article_number)
);

-- Listen/Filter: Mandant + Status; Summen/Join auf Artikel: Mandant + Artikelnummer;
-- Suche (`ilike '%…%'`) über SSCC und Artikelnummer; Bereinigung: Alter.
create index idx_stock_positions_tenant_status on public.stock_positions (tenant_id, status);
create index idx_stock_positions_tenant_article on public.stock_positions (tenant_id, article_number);
create index idx_stock_positions_sscc_trgm on public.stock_positions using gin (sscc extensions.gin_trgm_ops);
create index idx_stock_positions_article_trgm
  on public.stock_positions using gin (article_number extensions.gin_trgm_ops);
create index idx_stock_positions_updated on public.stock_positions (updated_at) where status <> 'in_stock';
create index idx_stock_positions_last_import on public.stock_positions (last_import_id);

-- ---------------------------------------------------------------------------------------------
-- Import-Verlauf je Position (Importe, in denen die Position vorkam). Wird mit der Position
-- (bzw. dem Protokoll) mitbereinigt.
-- ---------------------------------------------------------------------------------------------
create table public.stock_import_positions (
  import_id uuid not null references public.stock_imports (id) on delete cascade,
  position_id uuid not null references public.stock_positions (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (import_id, position_id)
);
create index idx_stock_import_positions_position on public.stock_import_positions (position_id, created_at desc);
create index idx_stock_import_positions_tenant on public.stock_import_positions (tenant_id);

-- ---------------------------------------------------------------------------------------------
-- Import (Vorschau und Übernahme)
--
-- Der Server liest und prüft die Datei (CSV/XML, Artikelnummer-Umwandlung, Duplikate, ungültige
-- Zeilen) und übergibt das Ergebnis:
--   p_records  gültige, eindeutige Positionen (snake_case: sscc, article_number, quantity,
--              free_quantity, qs_quantity, blocked_quantity, qs_and_blocked_quantity, unit,
--              logistics_center, stock_group)
--   p_excluded Schlüssel {sscc, article_number} fehlerhafter Duplikate: diese Positionen bleiben
--              unverändert und werden nicht als fehlend markiert
--   p_skipped  [{reason, count, lines}] übersprungene Zeilen
--   p_errors   [{sscc, articleNumber, message}] Fehler aus der Dateiprüfung
-- Die Funktion vergleicht mit dem Bestand, ergänzt Fehler (Versendet kommt wieder vor) und
-- liefert das Ergebnis als jsonb. Mit p_commit = true wird alles in dieser einen Transaktion
-- gespeichert; ein zweiter gleichzeitiger Import desselben Mandanten wird mit 55P03 abgelehnt.
-- Fehler: 42501 (kein Recht), 22023 (ungültige Parameter), 55P03 (Import läuft bereits).
-- ---------------------------------------------------------------------------------------------
create or replace function public.stock_import(
  p_tenant_id uuid,
  p_file_name text,
  p_record_count integer,
  p_records jsonb,
  p_excluded jsonb,
  p_skipped jsonb,
  p_errors jsonb,
  p_commit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_user_name text;
  v_import_id uuid;
  v_file_name text := left(btrim(coalesce(p_file_name, '')), 255);
  v_new integer;
  v_changed integer;
  v_unchanged integer;
  v_reappeared integer;
  v_missing integer;
  v_skipped_count integer;
  v_all_errors jsonb;
  v_error_count integer;
  v_unknown jsonb;
begin
  if v_caller is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if coalesce(public.mask_access_level(p_tenant_id, 'warenwirtschaft', 'lagerbestand'), '') <> 'write' then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = '42501';
  end if;
  if v_file_name = '' or p_record_count is null or p_record_count < 0
     or jsonb_typeof(p_records) is distinct from 'array'
     or jsonb_typeof(coalesce(p_excluded, '[]'::jsonb)) is distinct from 'array'
     or jsonb_typeof(coalesce(p_skipped, '[]'::jsonb)) is distinct from 'array'
     or jsonb_typeof(coalesce(p_errors, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Ungültige Importdaten.' using errcode = '22023';
  end if;

  if p_commit then
    if not pg_try_advisory_xact_lock(hashtextextended('stock_import:' || p_tenant_id::text, 0)) then
      raise exception 'Für diesen Mandanten läuft bereits ein Import. Bitte warte, bis er abgeschlossen ist.'
        using errcode = '55P03';
    end if;
    -- Bestand des Mandanten sperren: gleichzeitige Prüfungen/Buchungen warten, danach gilt der
    -- aktuelle Stand (READ COMMITTED sieht nach dem Warten die neuen Zeilen).
    perform 1 from public.stock_positions where tenant_id = p_tenant_id for update;
  end if;

  drop table if exists pg_temp._stock_rec;
  drop table if exists pg_temp._stock_excl;
  drop table if exists pg_temp._stock_class;

  create temp table _stock_rec on commit drop as
  select r.sscc,
         r.article_number,
         r.quantity::numeric(18, 3) as quantity,
         r.free_quantity::numeric(18, 3) as free_quantity,
         r.qs_quantity::numeric(18, 3) as qs_quantity,
         r.blocked_quantity::numeric(18, 3) as blocked_quantity,
         r.qs_and_blocked_quantity::numeric(18, 3) as qs_and_blocked_quantity,
         nullif(btrim(r.unit), '') as unit,
         nullif(btrim(r.logistics_center), '') as logistics_center,
         nullif(btrim(r.stock_group), '') as stock_group
  from jsonb_to_recordset(p_records) as r (
    sscc text, article_number text, quantity numeric, free_quantity numeric, qs_quantity numeric,
    blocked_quantity numeric, qs_and_blocked_quantity numeric, unit text, logistics_center text,
    stock_group text
  );
  create unique index on _stock_rec (sscc, article_number);

  create temp table _stock_excl on commit drop as
  select e.sscc, e.article_number
  from jsonb_to_recordset(coalesce(p_excluded, '[]'::jsonb)) as e (sscc text, article_number text);
  create index on _stock_excl (sscc, article_number);

  -- Vergleich mit dem Bestand: new | changed | unchanged | reappeared | shipped_again
  create temp table _stock_class on commit drop as
  select r.*,
         p.id as position_id,
         p.status as old_status,
         case
           when p.id is null then 'new'
           when p.status = 'shipped' then 'shipped_again'
           when p.status in ('missing_unchecked', 'missing_checked') then 'reappeared'
           when (p.quantity, p.free_quantity, p.qs_quantity, p.blocked_quantity, p.qs_and_blocked_quantity,
                 p.unit, p.logistics_center, p.stock_group)
                is not distinct from
                (r.quantity, r.free_quantity, r.qs_quantity, r.blocked_quantity, r.qs_and_blocked_quantity,
                 r.unit, r.logistics_center, r.stock_group) then 'unchanged'
           else 'changed'
         end as kind
  from _stock_rec r
  left join public.stock_positions p
    on p.tenant_id = p_tenant_id and p.sscc = r.sscc and p.article_number = r.article_number;

  select count(*) filter (where kind = 'new'),
         count(*) filter (where kind = 'changed'),
         count(*) filter (where kind = 'unchanged'),
         count(*) filter (where kind = 'reappeared')
    into v_new, v_changed, v_unchanged, v_reappeared
    from _stock_class;

  select count(*) into v_missing
  from public.stock_positions p
  where p.tenant_id = p_tenant_id
    and p.status = 'in_stock'
    and not exists (select 1 from _stock_rec r where r.sscc = p.sscc and r.article_number = p.article_number)
    and not exists (select 1 from _stock_excl e where e.sscc = p.sscc and e.article_number = p.article_number);

  -- Fehler: aus der Dateiprüfung + bereits versendete LHM, die im Abzug wieder vorkommen.
  select coalesce(jsonb_agg(x.err), '[]'::jsonb), count(*)
    into v_all_errors, v_error_count
  from (
    select e as err from jsonb_array_elements(coalesce(p_errors, '[]'::jsonb)) e
    union all
    select jsonb_build_object(
             'sscc', c.sscc,
             'articleNumber', c.article_number,
             'message', 'Das LHM ist als versendet gebucht, kommt im Abzug aber wieder vor. Die Zeile wurde übersprungen; bitte im Lagersystem klären.')
    from _stock_class c
    where c.kind = 'shipped_again'
  ) x;

  select coalesce(sum((s ->> 'count')::integer), 0) into v_skipped_count
  from jsonb_array_elements(coalesce(p_skipped, '[]'::jsonb)) s;

  select coalesce(jsonb_agg(u.article_number order by u.article_number), '[]'::jsonb) into v_unknown
  from (
    select distinct c.article_number
    from _stock_class c
    where c.kind <> 'shipped_again'
      and not exists (
        select 1 from public.articles a
        where a.tenant_id = p_tenant_id and a.article_number = c.article_number)
  ) u;

  if p_commit then
    select username into v_user_name from public.user_profiles where id = v_caller;

    insert into public.stock_imports (
      tenant_id, user_id, user_name, file_name, record_count,
      new_count, changed_count, unchanged_count, missing_count, reappeared_count,
      skipped_count, error_count, skipped, errors, unknown_articles
    ) values (
      p_tenant_id, v_caller, v_user_name, v_file_name, p_record_count,
      v_new, v_changed, v_unchanged, v_missing, v_reappeared,
      v_skipped_count, v_error_count,
      coalesce(p_skipped, '[]'::jsonb),
      (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(v_all_errors) e limit 500) t),
      v_unknown
    ) returning id into v_import_id;

    insert into public.stock_positions (
      tenant_id, sscc, article_number, quantity, free_quantity, qs_quantity, blocked_quantity,
      qs_and_blocked_quantity, unit, logistics_center, stock_group, status,
      first_seen_at, last_seen_at, updated_at, last_import_id
    )
    select p_tenant_id, c.sscc, c.article_number, c.quantity, c.free_quantity, c.qs_quantity,
           c.blocked_quantity, c.qs_and_blocked_quantity, c.unit, c.logistics_center, c.stock_group,
           'in_stock', now(), now(), now(), v_import_id
    from _stock_class c
    where c.kind = 'new';

    -- Geänderte und wieder aufgetauchte Positionen: Werte übernehmen, wieder "Im Lager"; die
    -- Prüfinformation der Fehlt-Phase entfällt (der Verlauf steht im Import-Protokoll).
    update public.stock_positions p
       set quantity = c.quantity,
           free_quantity = c.free_quantity,
           qs_quantity = c.qs_quantity,
           blocked_quantity = c.blocked_quantity,
           qs_and_blocked_quantity = c.qs_and_blocked_quantity,
           unit = c.unit,
           logistics_center = c.logistics_center,
           stock_group = c.stock_group,
           status = 'in_stock',
           checked_by = null,
           checked_at = null,
           check_remark = null,
           last_seen_at = now(),
           updated_at = now(),
           last_import_id = v_import_id
      from _stock_class c
     where p.id = c.position_id
       and c.kind in ('changed', 'reappeared')
       and p.status = c.old_status;

    update public.stock_positions p
       set last_seen_at = now(), last_import_id = v_import_id
      from _stock_class c
     where p.id = c.position_id and c.kind = 'unchanged';

    update public.stock_positions p
       set status = 'missing_unchecked', updated_at = now()
     where p.tenant_id = p_tenant_id
       and p.status = 'in_stock'
       and not exists (select 1 from _stock_rec r where r.sscc = p.sscc and r.article_number = p.article_number)
       and not exists (select 1 from _stock_excl e where e.sscc = p.sscc and e.article_number = p.article_number);

    insert into public.stock_import_positions (import_id, position_id, tenant_id)
    select v_import_id, p.id, p_tenant_id
    from public.stock_positions p
    where p.tenant_id = p_tenant_id and p.last_import_id = v_import_id;
  end if;

  return jsonb_build_object(
    'fileName', v_file_name,
    'recordCount', p_record_count,
    'counts', jsonb_build_object(
      'new', v_new, 'changed', v_changed, 'unchanged', v_unchanged,
      'missing', v_missing, 'reappeared', v_reappeared),
    'skippedCount', v_skipped_count,
    'skipped', coalesce(p_skipped, '[]'::jsonb),
    'errors', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(v_all_errors) e limit 500) t),
    'unknownArticles', v_unknown
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Prüfung "geprüft i.O." und manuelle Versandbuchung.
-- Kein Bearbeitungsschloss: die Aktion gelingt nur, wenn die Position noch im erwarteten Status
-- ist. Rückgabe: 'ok' | 'conflict' (Status hat sich geändert) | 'not_found'.
--  * Prüfen: nur "Fehlt, ungeprüft" → "Fehlt, geprüft i.O." (Prüfer, Zeitpunkt, Bemerkung).
--  * Versand buchen: "Fehlt, ungeprüft" oder "Fehlt, geprüft i.O." → "Versendet" (Nutzer, Zeitpunkt);
--    auch nach einer Prüfung möglich, weil die Versandbuchung verspätet eintreffen kann.
-- ---------------------------------------------------------------------------------------------
create or replace function public.stock_check_position(
  p_tenant_id uuid,
  p_position_id uuid,
  p_expected_status text,
  p_remark text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_remark text := nullif(btrim(coalesce(p_remark, '')), '');
begin
  if v_caller is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if coalesce(public.mask_access_level(p_tenant_id, 'warenwirtschaft', 'lagerbestand'), '') <> 'write' then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = '42501';
  end if;
  if v_remark is not null and char_length(v_remark) > 500 then
    raise exception 'Die Bemerkung darf höchstens 500 Zeichen lang sein.' using errcode = '22023';
  end if;

  update public.stock_positions
     set status = 'missing_checked',
         checked_by = v_caller,
         checked_at = now(),
         check_remark = v_remark,
         updated_at = now()
   where id = p_position_id
     and tenant_id = p_tenant_id
     and status = 'missing_unchecked'
     and status = p_expected_status;
  if found then return 'ok'; end if;

  if exists (select 1 from public.stock_positions where id = p_position_id and tenant_id = p_tenant_id) then
    return 'conflict';
  end if;
  return 'not_found';
end;
$$;

create or replace function public.stock_ship_position(
  p_tenant_id uuid,
  p_position_id uuid,
  p_expected_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if coalesce(public.mask_access_level(p_tenant_id, 'warenwirtschaft', 'lagerbestand'), '') <> 'write' then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = '42501';
  end if;

  update public.stock_positions
     set status = 'shipped',
         shipped_by = v_caller,
         shipped_at = now(),
         -- Die Fehlt-Markierung entfällt; die Prüfinformation bleibt als Nachweis erhalten.
         updated_at = now()
   where id = p_position_id
     and tenant_id = p_tenant_id
     and status in ('missing_unchecked', 'missing_checked')
     and status = p_expected_status;
  if found then return 'ok'; end if;

  if exists (select 1 from public.stock_positions where id = p_position_id and tenant_id = p_tenant_id) then
    return 'conflict';
  end if;
  return 'not_found';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5-Jahres-Bereinigung: entfernt Positionen, deren letzte Änderung länger als die Frist zurückliegt.
-- "Im Lager" bleibt immer erhalten (eine unveränderte, noch vorhandene Position ist nicht
-- veraltet). Import-Verlauf wird per Cascade mitentfernt; das Import-Protokoll bleibt bestehen.
-- Nicht für Clients freigegeben (Aufruf per pg_cron oder externem Job mit Service-Rolle).
-- ---------------------------------------------------------------------------------------------
create or replace function public.stock_cleanup(p_retention interval default interval '5 years')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.stock_positions
   where status <> 'in_stock'
     and updated_at < now() - p_retention;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.stock_import(uuid, text, integer, jsonb, jsonb, jsonb, jsonb, boolean)
  from public, anon;
revoke execute on function public.stock_check_position(uuid, uuid, text, text) from public, anon;
revoke execute on function public.stock_ship_position(uuid, uuid, text) from public, anon;
revoke execute on function public.stock_cleanup(interval) from public, anon, authenticated;
grant execute on function public.stock_import(uuid, text, integer, jsonb, jsonb, jsonb, jsonb, boolean)
  to authenticated;
grant execute on function public.stock_check_position(uuid, uuid, text, text) to authenticated;
grant execute on function public.stock_ship_position(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Tägliche Ausführung der Bereinigung (03:15). Nur wenn pg_cron im Self-hosted-Setup verfügbar
-- ist; sonst bleibt die Funktion für einen externen Job aufrufbar (docs: siehe Spec PROJ-5):
--   select public.stock_cleanup();
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('proj5-stock-cleanup', '15 3 * * *', 'select public.stock_cleanup()');
  else
    raise notice 'pg_cron ist nicht verfügbar — public.stock_cleanup() bitte täglich extern aufrufen.';
  end if;
exception when others then
  raise notice 'pg_cron konnte nicht eingerichtet werden (%) — public.stock_cleanup() bitte täglich extern aufrufen.', sqlerrm;
end;
$$;
