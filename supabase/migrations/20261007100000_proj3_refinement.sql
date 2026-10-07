-- PROJ-3 Refinement (2026-10-07): Basisartikelnummer, Matchcode, Palettenklasse als Merkmal-Tabelle,
-- Verpackungsgruppe mit 4 Gewichtsfeldern.
--
--  * `articles.base_article_number` (Pflicht, 1–10 Ziffern); Artikelnummer = Basisartikelnummer || '.' || Kennziffer.
--  * `articles.base_article_id` (Merkmal Basisartikel) wird optional, liefert nur noch Kürzel/Bezeichnung/Zolltarif.
--  * `articles.match_code`: Kürzel von Artikeltyp, Markeninhaber, Saison, Basisartikel, Form/Design,
--    Packungsgröße, Geschmackssorte, mit "-" verbunden (fehlende übersprungen); wird vom Trigger berechnet und
--    bei Kürzel-Änderung in den Merkmal-Tabellen automatisch neu berechnet.
--  * Neue Merkmal-Tabelle `pallet_classes` ersetzt das Freitextfeld `articles.pallet_class`.
--  * `packaging_groups`: 4 Gewichtsfelder (g) statt `foil_weight`.
--
-- Bestehende Artikel waren reine Testdaten (Nutzerentscheidung 2026-10-07: bereinigen, keine Datenmigration).

delete from public.edit_locks where resource_type = 'article';
delete from public.articles;

-- ---------------------------------------------------------------------------------------------
-- Palettenklasse (Merkmal-Tabelle Nr. 10): nur ein Kürzel, startet leer, nur deaktivierbar.
-- ---------------------------------------------------------------------------------------------
create table public.pallet_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index pallet_classes_tenant_code_key on public.pallet_classes (tenant_id, lower(code));

create trigger pallet_classes_touch before update on public.pallet_classes
  for each row execute function public.touch_updated_at();

-- RLS wie alle anderen Merkmal-Tabellen (lesen: eigene Merkmal-Maske ODER Artikelstamm; schreiben:
-- Stufe "write" auf der eigenen Maske; keine DELETE-Policy).
alter table public.pallet_classes enable row level security;
alter table public.pallet_classes force row level security;

create policy "Mask readers see pallet_classes" on public.pallet_classes
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_palettenklasse') is not null
    or public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') is not null
  );
create policy "Mask writers insert pallet_classes" on public.pallet_classes
  for insert with check (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_palettenklasse') = 'write'
  );
create policy "Mask writers update pallet_classes" on public.pallet_classes
  for update
  using (public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_palettenklasse') = 'write')
  with check (public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_palettenklasse') = 'write');

-- ---------------------------------------------------------------------------------------------
-- Verpackungsgruppe: 4 Gewichtsfelder in g (DSD-Abrechnung): Folie/Pappe je Systembeteiligung und Transport.
-- ---------------------------------------------------------------------------------------------
alter table public.packaging_groups
  drop column foil_weight,
  add column foil_system_weight numeric(12, 3) check (foil_system_weight >= 0),
  add column cardboard_system_weight numeric(12, 3) check (cardboard_system_weight >= 0),
  add column foil_transport_weight numeric(12, 3) check (foil_transport_weight >= 0),
  add column cardboard_transport_weight numeric(12, 3) check (cardboard_transport_weight >= 0);

-- ---------------------------------------------------------------------------------------------
-- Artikel
-- ---------------------------------------------------------------------------------------------
alter table public.articles
  add column base_article_number text not null check (base_article_number ~ '^[0-9]{1,10}$'),
  add column match_code text not null default '',
  add column pallet_class_id uuid,
  drop column pallet_class,
  alter column base_article_id drop not null,
  add foreign key (pallet_class_id, tenant_id) references public.pallet_classes (id, tenant_id);

-- Suche über den Matchcode (`ilike '%…%'`) und Fremdschlüssel-Spalten, über die die Neuberechnung sucht.
create index idx_articles_match_code_trgm on public.articles using gin (match_code extensions.gin_trgm_ops);
create index idx_articles_pallet_class on public.articles (pallet_class_id);
create index idx_articles_article_type on public.articles (article_type_id);
create index idx_articles_brand_owner on public.articles (brand_owner_id);
create index idx_articles_form_design on public.articles (form_design_id);
create index idx_articles_pack_size on public.articles (pack_size_id);
create index idx_articles_flavor on public.articles (flavor_id);

-- ---------------------------------------------------------------------------------------------
-- Trigger `articles_before_write` (Ersatz, Aufbau wie in 20261004100000_proj3_tables.sql):
--  1. Artikelnummer = Basisartikelnummer + "." + Kennziffer; Matchcode aus den 7 Kürzeln;
--     Warengruppe = Saison-Ziffer + Artikeltyp-Ziffer + "0"; Bruttogewicht = Gewicht + Tara.
--  2./3. unverändert (deaktivierte Merkmale nicht neu verwenden; Bearbeitungssperre). Der Matchcode
--     zählt wie Artikelnummer/Warengruppe als berechnet und löst keine Sperrprüfung aus.
-- ---------------------------------------------------------------------------------------------
create or replace function public.articles_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
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
  select commodity_digit into v_season_digit from public.seasons where id = new.season_id;
  select commodity_digit into v_type_digit from public.article_types where id = new.article_type_id;

  new.article_number := new.base_article_number || '.' || new.kennziffer;
  new.commodity_group := coalesce(v_season_digit, 0)::text || coalesce(v_type_digit, 0)::text || '0';
  new.gross_weight := case
    when new.weight is null and new.tara is null then null
    else coalesce(new.weight, 0) + coalesce(new.tara, 0)
  end;
  new.match_code := concat_ws('-',
    (select code from public.article_types where id = new.article_type_id and tenant_id = new.tenant_id),
    (select code from public.brand_owners where id = new.brand_owner_id and tenant_id = new.tenant_id),
    (select code from public.seasons where id = new.season_id and tenant_id = new.tenant_id),
    (select code from public.base_articles where id = new.base_article_id and tenant_id = new.tenant_id),
    (select code from public.form_designs where id = new.form_design_id and tenant_id = new.tenant_id),
    (select code from public.pack_sizes where id = new.pack_size_id and tenant_id = new.tenant_id),
    (select code from public.flavors where id = new.flavor_id and tenant_id = new.tenant_id)
  );

  -- 2. Deaktivierte Merkmale nicht neu verwenden.
  foreach v_pair in array array[
    'article_types:article_type_id', 'base_articles:base_article_id', 'brand_owners:brand_owner_id',
    'seasons:season_id', 'form_designs:form_design_id', 'pack_sizes:pack_size_id',
    'flavors:flavor_id', 'packaging_groups:packaging_group_id', 'vat_rates:vat_rate_id',
    'pallet_classes:pallet_class_id'
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
      (v_new - array['is_active', 'updated_at', 'updated_by', 'article_number', 'commodity_group', 'gross_weight', 'match_code'])
      is distinct from
      (v_old - array['is_active', 'updated_at', 'updated_by', 'article_number', 'commodity_group', 'gross_weight', 'match_code']);

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

-- ---------------------------------------------------------------------------------------------
-- Folge-Berechnung: Ändert sich ein Kürzel (oder eine Warengruppen-Ziffer) in einer der 7 Merkmal-
-- Tabellen, werden die betroffenen Artikel neu berechnet (No-op-Update feuert den Trigger oben auf
-- Tiefe 2 → keine Sperrprüfung, auch wenn der Aufrufer nur Rechte auf die Merkmal-Maske hat).
-- Ersetzt die drei Einzel-Funktionen/-Trigger aus der ersten PROJ-3-Migration; die Basisartikel-
-- Nummer fließt nicht mehr in die Artikelnummer ein, das Kürzel aber in den Matchcode.
-- Das Argument des Triggers ist die Verweisspalte am Artikel.
-- ---------------------------------------------------------------------------------------------
drop trigger seasons_recompute_articles on public.seasons;
drop trigger article_types_recompute_articles on public.article_types;
drop trigger base_articles_recompute_articles on public.base_articles;
drop function public.recompute_articles_for_season();
drop function public.recompute_articles_for_article_type();
drop function public.recompute_articles_for_base_article();

create or replace function public.recompute_articles_for_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format('update public.articles set %1$I = %1$I where %1$I = $1', tg_argv[0]) using new.id;
  return null;
end;
$$;

revoke execute on function public.recompute_articles_for_ref() from public, anon, authenticated;

create trigger article_types_recompute_articles
  after update of code, commodity_digit on public.article_types
  for each row when (old.code is distinct from new.code or old.commodity_digit is distinct from new.commodity_digit)
  execute function public.recompute_articles_for_ref('article_type_id');
create trigger seasons_recompute_articles
  after update of code, commodity_digit on public.seasons
  for each row when (old.code is distinct from new.code or old.commodity_digit is distinct from new.commodity_digit)
  execute function public.recompute_articles_for_ref('season_id');
create trigger base_articles_recompute_articles
  after update of code on public.base_articles
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('base_article_id');
create trigger brand_owners_recompute_articles
  after update of code on public.brand_owners
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('brand_owner_id');
create trigger form_designs_recompute_articles
  after update of code on public.form_designs
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('form_design_id');
create trigger pack_sizes_recompute_articles
  after update of code on public.pack_sizes
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('pack_size_id');
create trigger flavors_recompute_articles
  after update of code on public.flavors
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('flavor_id');
