-- PROJ-3: Artikelstamm — Zugriffsstufen, 9 Merkmal-Tabellen, Artikel (inkl. serverseitiger
-- Berechnung von Artikelnummer / Warengruppe / Bruttogewicht) und generische Bearbeitungssperre.
-- RLS-Policies und Sperr-Funktionen folgen in 20261004100100_proj3_rls.sql.

-- ---------------------------------------------------------------------------------------------
-- Zugriffsstufe pro Maskenrecht ("read" = Lesen, "write" = Lesen + Bearbeiten).
-- Bestehende Rechte (Benutzerverwaltung) behalten ihr Verhalten → "write".
-- ---------------------------------------------------------------------------------------------
alter table public.role_permissions
  add column access_level text not null default 'write'
  check (access_level in ('read', 'write'));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Merkmal-Tabellen (je Mandant getrennt, nur deaktivierbar, nie löschbar — es gibt keine
-- DELETE-Policy). `unique (id, tenant_id)` ermöglicht zusammengesetzte Fremdschlüssel, damit ein
-- Artikel nie einen Eintrag eines anderen Mandanten verwenden kann (Lehre aus PROJ-2 BUG-9).
-- Kürzel/Namen sind je Mandant case-insensitive eindeutig (Lehre aus PROJ-2 BUG-10/-11).
-- ---------------------------------------------------------------------------------------------
create table public.article_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  commodity_digit smallint not null check (commodity_digit between 0 and 9),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index article_types_tenant_code_key on public.article_types (tenant_id, lower(code));

create table public.brand_owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index brand_owners_tenant_code_key on public.brand_owners (tenant_id, lower(code));

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  commodity_digit smallint not null check (commodity_digit between 0 and 9),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index seasons_tenant_code_key on public.seasons (tenant_id, lower(code));

create table public.base_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 30),
  name text not null check (char_length(name) between 1 and 100),
  customs_tariff_number text check (char_length(customs_tariff_number) <= 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index base_articles_tenant_code_key on public.base_articles (tenant_id, lower(code));

create table public.form_designs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index form_designs_tenant_code_key on public.form_designs (tenant_id, lower(code));

create table public.pack_sizes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index pack_sizes_tenant_code_key on public.pack_sizes (tenant_id, lower(code));

create table public.flavors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index flavors_tenant_code_key on public.flavors (tenant_id, lower(code));

create table public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  rate_percent numeric(5, 2) not null check (rate_percent between 0 and 100),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index vat_rates_tenant_name_key on public.vat_rates (tenant_id, lower(name));

create table public.packaging_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  foil_weight numeric(12, 3) check (foil_weight >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index packaging_groups_tenant_name_key on public.packaging_groups (tenant_id, lower(name));

create trigger article_types_touch before update on public.article_types
  for each row execute function public.touch_updated_at();
create trigger brand_owners_touch before update on public.brand_owners
  for each row execute function public.touch_updated_at();
create trigger seasons_touch before update on public.seasons
  for each row execute function public.touch_updated_at();
create trigger base_articles_touch before update on public.base_articles
  for each row execute function public.touch_updated_at();
create trigger form_designs_touch before update on public.form_designs
  for each row execute function public.touch_updated_at();
create trigger pack_sizes_touch before update on public.pack_sizes
  for each row execute function public.touch_updated_at();
create trigger flavors_touch before update on public.flavors
  for each row execute function public.touch_updated_at();
create trigger vat_rates_touch before update on public.vat_rates
  for each row execute function public.touch_updated_at();
create trigger packaging_groups_touch before update on public.packaging_groups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Artikel. `article_number`, `commodity_group` und `gross_weight` werden ausschließlich vom
-- Trigger `articles_before_write` gesetzt (Werte aus dem Client werden überschrieben).
-- Verweise: zusammengesetzte FKs (id, tenant_id) → nur Einträge des eigenen Mandanten; bei NULL
-- (optionales Feld) wird nicht geprüft. Kein ON DELETE CASCADE auf Merkmale: Einträge werden nie
-- gelöscht, ein Löschversuch würde an verwendeten Artikeln scheitern.
-- ---------------------------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  article_type_id uuid,
  base_article_id uuid not null,
  kennziffer text not null check (kennziffer ~ '^[0-9]{4}$'),
  article_number text not null,
  commodity_group text not null,
  name text check (char_length(name) <= 200),
  description text check (char_length(description) <= 2000),

  brand_owner_id uuid,
  season_id uuid,
  form_design_id uuid,
  pack_size_id uuid,
  flavor_id uuid,

  fairtrade boolean not null default false,
  rainforest boolean not null default false,
  fsc boolean not null default false,

  pallet_class text check (char_length(pallet_class) <= 50),
  is_mixed boolean not null default false,
  mixed_count integer check (mixed_count >= 0),
  gtin_main text check (gtin_main ~ '^[0-9]{1,14}$'),
  gtin_mixed_1 text check (gtin_mixed_1 ~ '^[0-9]{1,14}$'),
  gtin_mixed_2 text check (gtin_mixed_2 ~ '^[0-9]{1,14}$'),
  carton_ean text check (carton_ean ~ '^[0-9]{1,14}$'),
  carton_content integer check (carton_content >= 0),
  width numeric(12, 3) check (width >= 0),
  length numeric(12, 3) check (length >= 0),
  height numeric(12, 3) check (height >= 0),
  weight numeric(12, 3) check (weight >= 0),
  tara numeric(12, 3) check (tara >= 0),
  gross_weight numeric(12, 3),
  pallet_factor numeric(12, 3) check (pallet_factor >= 0),
  packaging_group_id uuid,

  vat_rate_id uuid,
  customs_tariff_number text check (char_length(customs_tariff_number) <= 20),

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.user_profiles (id) on delete set null,
  updated_by uuid references public.user_profiles (id) on delete set null,

  unique (tenant_id, article_number),

  foreign key (article_type_id, tenant_id) references public.article_types (id, tenant_id),
  foreign key (base_article_id, tenant_id) references public.base_articles (id, tenant_id),
  foreign key (brand_owner_id, tenant_id) references public.brand_owners (id, tenant_id),
  foreign key (season_id, tenant_id) references public.seasons (id, tenant_id),
  foreign key (form_design_id, tenant_id) references public.form_designs (id, tenant_id),
  foreign key (pack_size_id, tenant_id) references public.pack_sizes (id, tenant_id),
  foreign key (flavor_id, tenant_id) references public.flavors (id, tenant_id),
  foreign key (packaging_group_id, tenant_id) references public.packaging_groups (id, tenant_id),
  foreign key (vat_rate_id, tenant_id) references public.vat_rates (id, tenant_id)
);

-- Liste/Filter: Mandant + Artikelnummer (Unique-Index oben), Typ, Status.
create index idx_articles_tenant_type on public.articles (tenant_id, article_type_id);
create index idx_articles_tenant_active on public.articles (tenant_id, is_active);
-- Fremdschlüssel-Spalten, über die die Neuberechnung bei Merkmal-Änderungen sucht.
create index idx_articles_base_article on public.articles (base_article_id);
create index idx_articles_season on public.articles (season_id);

-- Suche (`ilike '%…%'`) über Artikelnummer und Bezeichnung.
create extension if not exists pg_trgm with schema extensions;
create index idx_articles_number_trgm on public.articles using gin (article_number extensions.gin_trgm_ops);
create index idx_articles_name_trgm on public.articles using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Generische Bearbeitungssperre: Datensatztyp → Maske, die zum Sperren berechtigt. Künftige
-- Module tragen hier eine Zeile ein (keine Funktionsänderung nötig).
-- ---------------------------------------------------------------------------------------------
create table public.edit_lock_types (
  resource_type text primary key,
  module text not null,
  maske text not null
);

insert into public.edit_lock_types (resource_type, module, maske)
values ('article', 'warenwirtschaft', 'artikelstamm');

create table public.edit_locks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  resource_type text not null references public.edit_lock_types (resource_type),
  resource_id uuid not null,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Pro Datensatz höchstens eine Sperre.
  unique (tenant_id, resource_type, resource_id)
);
create index idx_edit_locks_user on public.edit_locks (user_id);
create index idx_edit_locks_expires on public.edit_locks (expires_at);

-- ---------------------------------------------------------------------------------------------
-- Trigger auf `articles`: Berechnung + Prüfungen (SECURITY DEFINER, damit er unabhängig von den
-- Leserechten des Aufrufers auf Merkmale und Sperren arbeitet).
--
--  1. Artikelnummer = Basisartikel-Nummer + Kennziffer; Warengruppe = Saison-Ziffer +
--     Artikeltyp-Ziffer + "0" (fehlende Ziffer = 0); Bruttogewicht = Gewicht + Tara.
--  2. Neu gewählte Merkmal-Einträge dürfen nicht deaktiviert sein (bestehende Verweise auf
--     inzwischen deaktivierte Einträge bleiben unangetastet).
--  3. Bearbeitungssperre (nur für Client-Aufrufe, `auth.uid()` gesetzt, und nicht bei
--     verschachtelten Updates durch die Neuberechnung unten):
--       - Inhaltsänderung → Aufrufer muss die eigene, gültige Sperre halten;
--       - nur Aktivieren/Deaktivieren → es darf keine fremde gültige Sperre bestehen.
--     Fehler: SQLSTATE 55P03 mit deutscher Meldung (nennt den sperrenden Nutzer).
-- ---------------------------------------------------------------------------------------------
create or replace function public.articles_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  v_base_code text;
  v_season_digit smallint;
  v_type_digit smallint;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := to_jsonb(new);
  v_pair text;
  v_table text;
  v_col text;
  v_new_ref uuid;
  v_active boolean;
  v_content_changed boolean;
  v_lock_user uuid;
  v_lock_name text;
begin
  select code into v_base_code
  from public.base_articles
  where id = new.base_article_id and tenant_id = new.tenant_id;
  if v_base_code is null then
    raise exception 'Der gewählte Basisartikel existiert nicht in diesem Mandanten.'
      using errcode = '23503';
  end if;

  select commodity_digit into v_season_digit from public.seasons where id = new.season_id;
  select commodity_digit into v_type_digit from public.article_types where id = new.article_type_id;

  new.article_number := v_base_code || new.kennziffer;
  new.commodity_group := coalesce(v_season_digit, 0)::text || coalesce(v_type_digit, 0)::text || '0';
  new.gross_weight := case
    when new.weight is null and new.tara is null then null
    else coalesce(new.weight, 0) + coalesce(new.tara, 0)
  end;

  -- 2. Deaktivierte Merkmale nicht neu verwenden.
  foreach v_pair in array array[
    'article_types:article_type_id', 'base_articles:base_article_id', 'brand_owners:brand_owner_id',
    'seasons:season_id', 'form_designs:form_design_id', 'pack_sizes:pack_size_id',
    'flavors:flavor_id', 'packaging_groups:packaging_group_id', 'vat_rates:vat_rate_id'
  ]
  loop
    v_table := split_part(v_pair, ':', 1);
    v_col := split_part(v_pair, ':', 2);
    v_new_ref := (v_new ->> v_col)::uuid;
    if v_new_ref is not null and v_new_ref is distinct from (v_old ->> v_col)::uuid then
      execute format('select is_active from public.%I where id = $1 and tenant_id = $2', v_table)
        into v_active using v_new_ref, new.tenant_id;
      if v_active is false then
        raise exception 'Ein gewählter Merkmal-Eintrag ist deaktiviert und kann nicht neu verwendet werden.'
          using errcode = '23514';
      end if;
    end if;
  end loop;

  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := caller;
    new.updated_by := caller;
    return new;
  end if;

  -- 3. Bearbeitungssperre
  if caller is not null and pg_trigger_depth() = 1 then
    new.updated_by := caller;

    v_content_changed :=
      (v_new - array['is_active', 'updated_at', 'updated_by', 'article_number', 'commodity_group', 'gross_weight'])
      is distinct from
      (v_old - array['is_active', 'updated_at', 'updated_by', 'article_number', 'commodity_group', 'gross_weight']);

    if v_content_changed or new.is_active is distinct from old.is_active then
      select l.user_id, up.username into v_lock_user, v_lock_name
      from public.edit_locks l
      join public.user_profiles up on up.id = l.user_id
      where l.tenant_id = new.tenant_id
        and l.resource_type = 'article'
        and l.resource_id = new.id
        and l.expires_at > now();

      if v_lock_user is not null and v_lock_user <> caller then
        raise exception 'Der Artikel wird gerade von % bearbeitet. Bitte versuche es später erneut.', v_lock_name
          using errcode = '55P03';
      end if;
      if v_content_changed and v_lock_user is null then
        raise exception 'Deine Bearbeitungssperre ist abgelaufen. Bitte sperre den Artikel erneut, bevor du speicherst.'
          using errcode = '55P03';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.articles_before_write() from public, anon, authenticated;

create trigger articles_before_write
  before insert or update on public.articles
  for each row execute function public.articles_before_write();

-- Ändert sich eine Warengruppen-Ziffer oder die Nummer eines Basisartikels, werden die
-- betroffenen Artikel neu berechnet. Das No-op-Update feuert den Trigger oben (Tiefe 2 →
-- keine Sperrprüfung) auch dann, wenn der Aufrufer nur Rechte auf die Merkmal-Maske hat.
create or replace function public.recompute_articles_for_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.articles set season_id = season_id where season_id = new.id;
  return null;
end;
$$;

create or replace function public.recompute_articles_for_article_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.articles set article_type_id = article_type_id where article_type_id = new.id;
  return null;
end;
$$;

create or replace function public.recompute_articles_for_base_article()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.articles set base_article_id = base_article_id where base_article_id = new.id;
  return null;
end;
$$;

revoke execute on function public.recompute_articles_for_season() from public, anon, authenticated;
revoke execute on function public.recompute_articles_for_article_type() from public, anon, authenticated;
revoke execute on function public.recompute_articles_for_base_article() from public, anon, authenticated;

create trigger seasons_recompute_articles
  after update of commodity_digit on public.seasons
  for each row when (old.commodity_digit is distinct from new.commodity_digit)
  execute function public.recompute_articles_for_season();

create trigger article_types_recompute_articles
  after update of commodity_digit on public.article_types
  for each row when (old.commodity_digit is distinct from new.commodity_digit)
  execute function public.recompute_articles_for_article_type();

create trigger base_articles_recompute_articles
  after update of code on public.base_articles
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_base_article();
