-- PROJ-4: Adressen — Tabellen (Länder, Adressen, Kontakte), Zusatzrecht "aktivieren/deaktivieren",
-- Umstellung des Markeninhabers am Artikel auf Adressen, Hierarchie-/Status-Funktionen.
-- RLS-Policies der neuen Tabellen folgen in 20261008100100_proj4_rls.sql.
--
-- Entscheidungen (siehe Tech Design in features/PROJ-4-adressen.md):
--  * Hierarchie = Verweis `parent_address_id` an der Adresse; Zyklen verhindert der Trigger.
--  * Kaskadierendes (De)Aktivieren ist EIN Vorgang (`set_address_status`), Status direkt per
--    UPDATE zu ändern ist für Clients gesperrt (nur über die Funktion, die das Zusatzrecht prüft).
--  * Auf keiner Tabelle gibt es eine DELETE-Policy: nur deaktivieren.

-- ---------------------------------------------------------------------------------------------
-- Zusatzrecht je Maskenrecht: darf die Rolle in dieser Maske aktivieren/deaktivieren?
-- Nur zusammen mit Stufe "write" sinnvoll. Wirksam ist es in PROJ-4 nur für Adressen.
-- ---------------------------------------------------------------------------------------------
alter table public.role_permissions
  add column can_toggle_active boolean not null default false,
  add constraint role_permissions_toggle_needs_write check (not can_toggle_active or access_level = 'write');

-- ---------------------------------------------------------------------------------------------
-- Länder (Merkmal-Tabelle des Adressstamms): Kürzel 2–3 Buchstaben, pro Mandant eindeutig,
-- startet leer, nur deaktivierbar.
-- ---------------------------------------------------------------------------------------------
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[[:alpha:]]{2,3}$'),
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index countries_tenant_code_key on public.countries (tenant_id, lower(code));

-- Länderkürzel werden automatisch in Großbuchstaben gespeichert.
create or replace function public.countries_before_write()
returns trigger
language plpgsql
as $$
begin
  new.code := upper(btrim(new.code));
  new.updated_at := now();
  return new;
end;
$$;

create trigger countries_before_write before insert or update on public.countries
  for each row execute function public.countries_before_write();

-- ---------------------------------------------------------------------------------------------
-- Adressen. `address_number` und `search_text` setzt ausschließlich der Trigger.
-- Verweise auf andere Adressen/Länder: zusammengesetzte FKs (id, tenant_id) → nur Einträge des
-- eigenen Mandanten. Kein ON DELETE CASCADE: Adressen werden nie gelöscht.
-- ---------------------------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  address_base text not null check (address_base ~ '^[0-9]{1,10}$'),
  address_suffix text not null check (address_suffix ~ '^[0-9]{4}$'),
  address_number text not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  name_addition text check (char_length(name_addition) <= 200),
  code text check (char_length(code) between 1 and 10),
  gln text check (gln ~ '^[0-9]{13}$'),
  roles text[] not null default '{}'
    check (roles <@ array['customer', 'supplier', 'carrier', 'service_provider', 'delivery_address', 'other']::text[]),

  street text check (char_length(street) <= 200),
  house_number text check (char_length(house_number) <= 20),
  postal_code text check (char_length(postal_code) <= 10),
  city text check (char_length(city) <= 100),
  country_id uuid,

  phone text check (char_length(phone) <= 50),
  email text check (char_length(email) <= 254),
  website text check (char_length(website) <= 200),
  vat_id text check (char_length(vat_id) <= 15),
  remark text check (char_length(remark) <= 2000),

  parent_address_id uuid,
  invoice_recipient_id uuid,
  invoice_ship_to_id uuid,
  billing_company_id uuid,

  is_active boolean not null default true,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.user_profiles (id) on delete set null,
  updated_by uuid references public.user_profiles (id) on delete set null,

  unique (id, tenant_id),
  unique (tenant_id, address_number),

  foreign key (country_id, tenant_id) references public.countries (id, tenant_id),
  foreign key (parent_address_id, tenant_id) references public.addresses (id, tenant_id),
  foreign key (invoice_recipient_id, tenant_id) references public.addresses (id, tenant_id),
  foreign key (invoice_ship_to_id, tenant_id) references public.addresses (id, tenant_id),
  foreign key (billing_company_id, tenant_id) references public.addresses (id, tenant_id)
);

-- Liste/Filter: Mandant + Adressnummer (Unique-Index), Status, Land, Rolle.
create index idx_addresses_tenant_active on public.addresses (tenant_id, is_active);
create index idx_addresses_country on public.addresses (country_id);
create index idx_addresses_roles on public.addresses using gin (roles);
-- Hierarchie-Auswertungen und Verweise (rekursive Abfragen laufen über parent_address_id).
create index idx_addresses_parent on public.addresses (parent_address_id);
create index idx_addresses_invoice_recipient on public.addresses (invoice_recipient_id);
create index idx_addresses_invoice_ship_to on public.addresses (invoice_ship_to_id);
create index idx_addresses_billing_company on public.addresses (billing_company_id);
-- Kürzel-Duplikatprüfung (nicht eindeutig!) und Markeninhaber-Neuberechnung.
create index idx_addresses_tenant_code on public.addresses (tenant_id, lower(code)) where code is not null;
-- Suche (`ilike '%…%'`) über die gemeinsame Suchspalte.
create index idx_addresses_search_trgm on public.addresses using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Kontakte: gehören zu genau einer Adresse (nicht verschiebbar).
-- ---------------------------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  address_id uuid not null,
  salutation text check (char_length(salutation) <= 30),
  first_name text check (char_length(first_name) <= 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  function_title text check (char_length(function_title) <= 100),
  phone text check (char_length(phone) <= 50),
  mobile text check (char_length(mobile) <= 50),
  email text check (char_length(email) <= 254),
  remark text check (char_length(remark) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.user_profiles (id) on delete set null,
  updated_by uuid references public.user_profiles (id) on delete set null,

  unique (id, tenant_id),
  foreign key (address_id, tenant_id) references public.addresses (id, tenant_id)
);
create index idx_contacts_address on public.contacts (address_id);
create index idx_contacts_tenant_name on public.contacts (tenant_id, last_name, first_name);
create index idx_contacts_tenant_active on public.contacts (tenant_id, is_active);
create index idx_contacts_last_name_trgm on public.contacts using gin (last_name extensions.gin_trgm_ops);
create index idx_contacts_email_trgm on public.contacts using gin (email extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Bearbeitungssperre: zwei neue Datensatztypen im bestehenden generischen Mechanismus.
-- ---------------------------------------------------------------------------------------------
insert into public.edit_lock_types (resource_type, module, maske) values
  ('address', 'warenwirtschaft', 'adressen'),
  ('contact', 'warenwirtschaft', 'kontakte');

-- ---------------------------------------------------------------------------------------------
-- Zusatzrecht-Prüfung (Spiegel von mask_access_level): Stufe "write" UND can_toggle_active in
-- irgendeiner Rolle des Users im Mandanten. Super-Admins: immer.
-- ---------------------------------------------------------------------------------------------
create or replace function public.mask_can_toggle(p_tenant_id uuid, p_module text, p_maske text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_super_admin() then true
    else coalesce((
      select bool_or(rp.can_toggle_active and rp.access_level = 'write')
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.user_profiles up on up.id = ur.user_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = p_tenant_id
        and up.is_active
        and rp.module = p_module
        and rp.maske = p_maske
    ), false)
  end;
$$;

revoke execute on function public.mask_can_toggle(uuid, text, text) from public, anon;
grant execute on function public.mask_can_toggle(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Trigger auf `addresses` (SECURITY DEFINER, unabhängig von den Leserechten des Aufrufers):
--  1. Adressnummer = Basis || '.' || Kennziffer; Suchzeile.
--  2. Hierarchie ohne Zyklus (Selbstbezug eingeschlossen). Änderungen der Hierarchie werden je
--     Mandant über ein Advisory-Lock serialisiert, damit zwei gleichzeitige Änderungen keinen
--     Zyklus erzeugen können, den jede für sich nicht gesehen hat.
--  3. Neu gewählte Verweise (Land, übergeordnete Adresse, Rechnungsempfänger, -versand,
--     Abrechnungsgesellschaft) dürfen nicht deaktiviert sein; bestehende bleiben unangetastet.
--  4. Status: Clients dürfen `is_active` nicht direkt ändern (nur `set_address_status`); neue
--     Adressen sind immer aktiv.
--  5. Bearbeitungssperre (nur Client-Aufrufe, Tiefe 1): Inhaltsänderung → eigene gültige Sperre
--     nötig; fremde gültige Sperre → Ablehnung (55P03, deutsche Meldung mit Nutzername).
--
-- Fehlerzuordnung zum Formularfeld: `detail = 'field:<name>'` (die Routen geben es als `field` weiter).
-- ---------------------------------------------------------------------------------------------
create or replace function public.addresses_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  v_cascade boolean := coalesce(current_setting('app.address_cascade', true), '') = 'on';
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := to_jsonb(new);
  v_pair text;
  v_table text;
  v_col text;
  v_label text;
  v_new_ref uuid;
  v_active boolean;
  v_content_changed boolean;
  v_lock_user uuid;
  v_lock_name text;
  v_cycle boolean;
begin
  -- 1. Berechnete Felder
  new.address_number := new.address_base || '.' || new.address_suffix;
  new.search_text := concat_ws(' ', new.address_number, new.name, new.name_addition, new.code, new.gln, new.city, new.postal_code);

  -- 2. Hierarchie
  if new.parent_address_id is not null
     and (tg_op = 'INSERT' or new.parent_address_id is distinct from old.parent_address_id) then
    if new.parent_address_id = new.id then
      raise exception 'Eine Adresse kann nicht sich selbst übergeordnet sein.'
        using errcode = '23514', detail = 'field:parentAddressId';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('address_hierarchy:' || new.tenant_id::text, 0));
    -- Von der gewählten übergeordneten Adresse aufwärts: taucht die Adresse selbst auf → Zyklus.
    with recursive ancestors as (
      select a.id, a.parent_address_id
      from public.addresses a
      where a.id = new.parent_address_id and a.tenant_id = new.tenant_id
      union
      select p.id, p.parent_address_id
      from public.addresses p
      join ancestors c on p.id = c.parent_address_id and p.tenant_id = new.tenant_id
    )
    select exists (select 1 from ancestors where id = new.id) into v_cycle;
    if v_cycle then
      raise exception 'Die gewählte übergeordnete Adresse ist der Adresse selbst untergeordnet (Zyklus nicht erlaubt).'
        using errcode = '23514', detail = 'field:parentAddressId';
    end if;
  end if;

  -- 3. Deaktivierte Verweise nicht neu verwenden.
  foreach v_pair in array array[
    'countries:country_id:Land',
    'addresses:parent_address_id:Die übergeordnete Adresse',
    'addresses:invoice_recipient_id:Der Rechnungsempfänger',
    'addresses:invoice_ship_to_id:Der Rechnungsversand',
    'addresses:billing_company_id:Die Abrechnungsgesellschaft'
  ]
  loop
    v_table := split_part(v_pair, ':', 1);
    v_col := split_part(v_pair, ':', 2);
    v_label := split_part(v_pair, ':', 3);
    v_new_ref := (v_new ->> v_col)::uuid;
    -- Verweis auf sich selbst ist erlaubt (Rechnungsempfänger etc.) und nie "inaktiv neu gewählt".
    if v_new_ref is not null
       and v_new_ref is distinct from (v_old ->> v_col)::uuid
       and not (v_table = 'addresses' and v_new_ref = new.id) then
      execute format('select is_active from public.%I where id = $1 and tenant_id = $2', v_table)
        into v_active using v_new_ref, new.tenant_id;
      if v_active is false then
        raise exception '% ist deaktiviert und kann nicht neu gewählt werden.', v_label
          using errcode = '23514', detail = 'field:' || case v_col
            when 'country_id' then 'countryId'
            when 'parent_address_id' then 'parentAddressId'
            when 'invoice_recipient_id' then 'invoiceRecipientId'
            when 'invoice_ship_to_id' then 'invoiceShipToId'
            else 'billingCompanyId' end;
      end if;
    end if;
  end loop;

  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := caller;
    new.updated_by := caller;
    -- 4. Neue Adressen sind aktiv (Clients können nicht inaktiv anlegen).
    if caller is not null then new.is_active := true; end if;
    return new;
  end if;

  -- 4. Statuswechsel nur über set_address_status (Zusatzrecht, Kaskade, Kontakte).
  if caller is not null and not v_cascade and new.is_active is distinct from old.is_active then
    raise exception 'Aktivieren/Deaktivieren ist nur über die Statusfunktion erlaubt.'
      using errcode = '42501';
  end if;

  -- 5. Bearbeitungssperre
  if caller is not null and not v_cascade and pg_trigger_depth() = 1 then
    new.updated_by := caller;

    v_content_changed :=
      (v_new - array['updated_at', 'updated_by', 'address_number', 'search_text'])
      is distinct from
      (v_old - array['updated_at', 'updated_by', 'address_number', 'search_text']);

    if v_content_changed then
      select l.user_id, up.username into v_lock_user, v_lock_name
      from public.edit_locks l
      join public.user_profiles up on up.id = l.user_id
      where l.tenant_id = new.tenant_id
        and l.resource_type = 'address'
        and l.resource_id = new.id
        and l.expires_at > now();

      if v_lock_user is not null and v_lock_user <> caller then
        raise exception 'Die Adresse wird gerade von % bearbeitet. Bitte versuche es später erneut.', v_lock_name
          using errcode = '55P03';
      end if;
      if v_lock_user is null then
        raise exception 'Deine Bearbeitungssperre ist abgelaufen. Bitte sperre die Adresse erneut, bevor du speicherst.'
          using errcode = '55P03';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.addresses_before_write() from public, anon, authenticated;

create trigger addresses_before_write
  before insert or update on public.addresses
  for each row execute function public.addresses_before_write();

-- ---------------------------------------------------------------------------------------------
-- Trigger auf `contacts`: Adresse unveränderlich und aktiv beim Anlegen, Bearbeitungssperre
-- (Inhaltsänderung → eigene Sperre; Statuswechsel → keine fremde Sperre). Die Kaskade von
-- `set_address_status` (app.address_cascade) umgeht die Sperrprüfung bewusst.
-- ---------------------------------------------------------------------------------------------
create or replace function public.contacts_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  v_cascade boolean := coalesce(current_setting('app.address_cascade', true), '') = 'on';
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := to_jsonb(new);
  v_content_changed boolean;
  v_lock_user uuid;
  v_lock_name text;
  v_address_active boolean;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := caller;
    new.updated_by := caller;
    if caller is not null then new.is_active := true; end if;
    select is_active into v_address_active from public.addresses
      where id = new.address_id and tenant_id = new.tenant_id;
    if v_address_active is false then
      raise exception 'Zu einer deaktivierten Adresse können keine Kontakte angelegt werden.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.address_id is distinct from old.address_id then
    raise exception 'Ein Kontakt kann nicht einer anderen Adresse zugeordnet werden.'
      using errcode = '23514';
  end if;

  if caller is not null and not v_cascade and pg_trigger_depth() = 1 then
    new.updated_by := caller;

    v_content_changed :=
      (v_new - array['is_active', 'updated_at', 'updated_by'])
      is distinct from
      (v_old - array['is_active', 'updated_at', 'updated_by']);

    if v_content_changed or new.is_active is distinct from old.is_active then
      select l.user_id, up.username into v_lock_user, v_lock_name
      from public.edit_locks l
      join public.user_profiles up on up.id = l.user_id
      where l.tenant_id = new.tenant_id
        and l.resource_type = 'contact'
        and l.resource_id = new.id
        and l.expires_at > now();

      if v_lock_user is not null and v_lock_user <> caller then
        raise exception 'Der Kontakt wird gerade von % bearbeitet. Bitte versuche es später erneut.', v_lock_name
          using errcode = '55P03';
      end if;
      if v_content_changed and v_lock_user is null then
        raise exception 'Deine Bearbeitungssperre ist abgelaufen. Bitte sperre den Kontakt erneut, bevor du speicherst.'
          using errcode = '55P03';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.contacts_before_write() from public, anon, authenticated;

create trigger contacts_before_write
  before insert or update on public.contacts
  for each row execute function public.contacts_before_write();

-- ---------------------------------------------------------------------------------------------
-- Umstellung Markeninhaber am Artikel: Verweis auf Adressen (mit Kürzel) statt Merkmal-Tabelle.
-- Vorhandene Zuordnungen waren Testdaten und werden geleert (Spec: keine aufwendige Migration).
-- Der Artikel-Trigger bekommt dafür zuerst seine neue Fassung (Kürzel aus `addresses`), erst dann
-- werden die Zuordnungen geleert und die alte Tabelle entfernt.
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
  v_owner_code text;
begin
  select commodity_digit into v_season_digit from public.seasons where id = new.season_id;
  select commodity_digit into v_type_digit from public.article_types where id = new.article_type_id;

  new.article_number := new.base_article_number || '.' || new.kennziffer;
  new.commodity_group := coalesce(v_season_digit, 0)::text || coalesce(v_type_digit, 0)::text || '0';
  new.gross_weight := case
    when new.weight is null and new.tara is null then null
    else coalesce(new.weight, 0) + coalesce(new.tara, 0)
  end;
  select code into v_owner_code from public.addresses
    where id = new.brand_owner_id and tenant_id = new.tenant_id;
  if new.brand_owner_id is not null and not found then
    raise exception 'Der gewählte Markeninhaber existiert nicht in diesem Mandanten.'
      using errcode = '23503', detail = 'field:brandOwnerId';
  end if;
  new.match_code := concat_ws('-',
    (select code from public.article_types where id = new.article_type_id and tenant_id = new.tenant_id),
    v_owner_code,
    (select code from public.seasons where id = new.season_id and tenant_id = new.tenant_id),
    (select code from public.base_articles where id = new.base_article_id and tenant_id = new.tenant_id),
    (select code from public.form_designs where id = new.form_design_id and tenant_id = new.tenant_id),
    (select code from public.pack_sizes where id = new.pack_size_id and tenant_id = new.tenant_id),
    (select code from public.flavors where id = new.flavor_id and tenant_id = new.tenant_id)
  );

  -- Der Markeninhaber muss eine Adresse mit Kürzel sein (bei neuer Wahl; später entferntes Kürzel
  -- lässt den bestehenden Verweis stehen, der Teil entfällt dann im Matchcode).
  if new.brand_owner_id is not null
     and new.brand_owner_id is distinct from (v_old ->> 'brand_owner_id')::uuid
     and v_owner_code is null then
    raise exception 'Der gewählte Markeninhaber hat kein Kürzel.'
      using errcode = '23514', detail = 'field:brandOwnerId';
  end if;

  -- Deaktivierte Merkmale/Adressen nicht neu verwenden.
  foreach v_pair in array array[
    'article_types:article_type_id', 'base_articles:base_article_id', 'addresses:brand_owner_id',
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

  -- Bearbeitungssperre
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

-- Zuordnungen leeren (Trigger läuft ohne Client-Kontext → keine Sperrprüfung), alte Tabelle,
-- ihre Neuberechnungs-Trigger und Rechte entfernen, neuen Verweis auf Adressen setzen.
drop trigger brand_owners_recompute_articles on public.brand_owners;
update public.articles set brand_owner_id = null where brand_owner_id is not null;
-- `cascade` entfernt den Fremdschlüssel von articles auf brand_owners (nicht die Spalte).
drop table public.brand_owners cascade;
alter table public.articles
  add constraint articles_brand_owner_id_tenant_id_fkey
  foreign key (brand_owner_id, tenant_id) references public.addresses (id, tenant_id);
delete from public.role_permissions where module = 'warenwirtschaft' and maske = 'merkmal_markeninhaber';

-- Ändert sich das Kürzel einer Adresse, werden die Matchcodes der Artikel mit dieser Adresse als
-- Markeninhaber neu berechnet (gleiches Muster wie bei den Merkmal-Kürzeln).
create trigger addresses_recompute_articles
  after update of code on public.addresses
  for each row when (old.code is distinct from new.code)
  execute function public.recompute_articles_for_ref('brand_owner_id');

-- ---------------------------------------------------------------------------------------------
-- Hierarchie- und Abfrage-Funktionen (SECURITY INVOKER → RLS des Aufrufers gilt, keine Rechte-
-- ausweitung). Rekursion in der Datenbank statt Schleifen in der Anwendung.
-- ---------------------------------------------------------------------------------------------

-- Adresse und alle ihre Nachkommen (beliebige Tiefe), mit Ebene (0 = die Adresse selbst).
create or replace function public.address_subtree(p_tenant_id uuid, p_address_id uuid)
returns table (out_id uuid, out_level int)
language sql
stable
set search_path = public
as $$
  with recursive tree as (
    select a.id, 0 as level
    from public.addresses a
    where a.id = p_address_id and a.tenant_id = p_tenant_id
    union
    select c.id, t.level + 1
    from public.addresses c
    join tree t on c.parent_address_id = t.id
    where c.tenant_id = p_tenant_id
  )
  select id, level from tree;
$$;

-- Suche für Auswahlfelder: nur aktive Adressen; optional nur mit Kürzel; optional ohne die
-- Adresse und ihre Nachkommen (Zyklusschutz). Begrenzte Trefferzahl.
create or replace function public.address_options(
  p_tenant_id uuid,
  p_q text default null,
  p_require_code boolean default false,
  p_exclude_subtree_of uuid default null,
  p_limit int default 25
)
returns table (out_id uuid, out_address_number text, out_name text, out_code text, out_is_active boolean)
language sql
stable
set search_path = public
as $$
  select a.id, a.address_number, a.name, a.code, a.is_active
  from public.addresses a
  where a.tenant_id = p_tenant_id
    and a.is_active
    and (not coalesce(p_require_code, false) or a.code is not null)
    and (
      p_q is null or btrim(p_q) = ''
      or a.search_text ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    )
    and (
      p_exclude_subtree_of is null
      or a.id not in (select out_id from public.address_subtree(p_tenant_id, p_exclude_subtree_of))
    )
  order by a.address_number
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

-- Nächste freie Kennziffer zu einer Basis: höchste vergebene + 1, sonst die erste Lücke.
create or replace function public.next_address_suffix(p_tenant_id uuid, p_base text)
returns table (out_exists boolean, out_suffix text)
language sql
stable
set search_path = public
as $$
  with used as (
    select address_suffix::int as n
    from public.addresses
    where tenant_id = p_tenant_id and address_base = p_base
  )
  select
    exists (select 1 from used),
    case
      when not exists (select 1 from used) then null
      when (select max(n) from used) < 9999 then lpad(((select max(n) from used) + 1)::text, 4, '0')
      else (
        select lpad(g::text, 4, '0')
        from generate_series(0, 9999) g
        where g not in (select n from used)
        order by g
        limit 1
      )
    end;
$$;

-- Alle Adressen mit demselben Kürzel (auch inaktive) — nur als Hinweis, kein Unique-Constraint.
create or replace function public.address_code_matches(
  p_tenant_id uuid,
  p_code text,
  p_exclude_id uuid default null
)
returns table (out_id uuid, out_address_number text, out_name text, out_code text, out_is_active boolean)
language sql
stable
set search_path = public
as $$
  select a.id, a.address_number, a.name, a.code, a.is_active
  from public.addresses a
  where a.tenant_id = p_tenant_id
    and a.code is not null
    and lower(a.code) = lower(btrim(p_code))
    and (p_exclude_id is null or a.id <> p_exclude_id)
  order by a.address_number
  limit 10;
$$;

-- Kontakte einer Adresse (Ebene 0) und aller Vorfahren (Ebene 1 = direkt übergeordnet …) mit
-- Herkunftsadresse. Gelesen wird unter den Rechten des Aufrufers (RLS auf contacts + addresses).
create or replace function public.address_contacts(p_tenant_id uuid, p_address_id uuid)
returns table (
  out_level int,
  out_id uuid,
  out_address_id uuid,
  out_address_number text,
  out_address_name text,
  out_salutation text,
  out_first_name text,
  out_last_name text,
  out_function_title text,
  out_phone text,
  out_mobile text,
  out_email text,
  out_remark text,
  out_is_active boolean
)
language sql
stable
set search_path = public
as $$
  with recursive chain as (
    select a.id, a.parent_address_id, 0 as level
    from public.addresses a
    where a.id = p_address_id and a.tenant_id = p_tenant_id
    union
    select p.id, p.parent_address_id, c.level + 1
    from public.addresses p
    join chain c on p.id = c.parent_address_id
    where p.tenant_id = p_tenant_id
  )
  select ch.level, ct.id, a.id, a.address_number, a.name,
         ct.salutation, ct.first_name, ct.last_name, ct.function_title,
         ct.phone, ct.mobile, ct.email, ct.remark, ct.is_active
  from chain ch
  join public.addresses a on a.id = ch.id
  join public.contacts ct on ct.address_id = ch.id and ct.tenant_id = p_tenant_id
  order by ch.level, ct.last_name, ct.first_name;
$$;

-- ---------------------------------------------------------------------------------------------
-- Aktivieren/Deaktivieren (SECURITY DEFINER): EIN unteilbarer Vorgang.
--  * braucht das Zusatzrecht (Stufe "write" + can_toggle_active) auf der Maske Adressen;
--  * die gewählte Adresse darf nicht von jemand anderem gesperrt sein (Sperren von
--    Unteradressen blockieren bewusst nicht — es wird nur der Status geändert);
--  * Deaktivieren: Adresse (+ optional alle Nachkommen) und deren Kontakte → inaktiv;
--  * Aktivieren: Adresse (+ optional alle Nachkommen, auch bereits vorher inaktive) → aktiv,
--    Kontakte bleiben inaktiv.
-- Fehler: 42501 (kein Recht), P0002 (nicht gefunden), 55P03 (gesperrt).
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_address_status(
  p_tenant_id uuid,
  p_address_id uuid,
  p_is_active boolean,
  p_include_children boolean
)
returns table (out_addresses int, out_contacts int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_ids uuid[];
  v_lock_user uuid;
  v_lock_name text;
  v_addresses int := 0;
  v_contacts int := 0;
begin
  if v_caller is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if not coalesce(public.mask_can_toggle(p_tenant_id, 'warenwirtschaft', 'adressen'), false) then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'Bitte einen Status angeben.' using errcode = '22023';
  end if;

  -- Hierarchie-Änderungen und Statuskaskaden je Mandant serialisieren.
  perform pg_advisory_xact_lock(hashtextextended('address_hierarchy:' || p_tenant_id::text, 0));

  if not exists (select 1 from public.addresses where id = p_address_id and tenant_id = p_tenant_id) then
    raise exception 'Adresse nicht gefunden.' using errcode = 'P0002';
  end if;

  select l.user_id, up.username into v_lock_user, v_lock_name
  from public.edit_locks l
  join public.user_profiles up on up.id = l.user_id
  where l.tenant_id = p_tenant_id
    and l.resource_type = 'address'
    and l.resource_id = p_address_id
    and l.expires_at > now();
  if v_lock_user is not null and v_lock_user <> v_caller then
    raise exception 'Die Adresse wird gerade von % bearbeitet. Bitte versuche es später erneut.', v_lock_name
      using errcode = '55P03';
  end if;

  if coalesce(p_include_children, false) then
    select array_agg(out_id) into v_ids from public.address_subtree_definer(p_tenant_id, p_address_id);
  else
    v_ids := array[p_address_id];
  end if;

  perform set_config('app.address_cascade', 'on', true);

  update public.addresses
    set is_active = p_is_active, updated_by = v_caller
    where tenant_id = p_tenant_id and id = any (v_ids) and is_active is distinct from p_is_active;
  get diagnostics v_addresses = row_count;

  if not p_is_active then
    update public.contacts
      set is_active = false, updated_by = v_caller
      where tenant_id = p_tenant_id and address_id = any (v_ids) and is_active;
    get diagnostics v_contacts = row_count;
  end if;

  perform set_config('app.address_cascade', 'off', true);

  return query select v_addresses, v_contacts;
end;
$$;

-- Hilfsfunktion für die Kaskade: Teilbaum ohne RLS des Aufrufers (Berechtigung wurde oben geprüft,
-- Mandant ist fest eingeschränkt). Nicht für Clients freigegeben.
create or replace function public.address_subtree_definer(p_tenant_id uuid, p_address_id uuid)
returns table (out_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select a.id from public.addresses a where a.id = p_address_id and a.tenant_id = p_tenant_id
    union
    select c.id from public.addresses c join tree t on c.parent_address_id = t.id where c.tenant_id = p_tenant_id
  )
  select id from tree;
$$;

revoke execute on function public.address_subtree_definer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.set_address_status(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.set_address_status(uuid, uuid, boolean, boolean) to authenticated;

revoke execute on function public.address_subtree(uuid, uuid) from public, anon;
revoke execute on function public.address_options(uuid, text, boolean, uuid, int) from public, anon;
revoke execute on function public.next_address_suffix(uuid, text) from public, anon;
revoke execute on function public.address_code_matches(uuid, text, uuid) from public, anon;
revoke execute on function public.address_contacts(uuid, uuid) from public, anon;
grant execute on function public.address_subtree(uuid, uuid) to authenticated;
grant execute on function public.address_options(uuid, text, boolean, uuid, int) to authenticated;
grant execute on function public.next_address_suffix(uuid, text) to authenticated;
grant execute on function public.address_code_matches(uuid, text, uuid) to authenticated;
grant execute on function public.address_contacts(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rechte-Vorbelegung (Nutzerentscheidung): Rollen mit der Maske Benutzerverwaltung (= Mandanten-
-- Admins) erhalten Adressen (inkl. Zusatzrecht), Kontakte und Länder mit "Lesen + Bearbeiten".
-- Alle anderen Rollen vergibt der Mandanten-Admin im Rollen-Dialog.
-- ---------------------------------------------------------------------------------------------
insert into public.role_permissions (role_id, module, maske, access_level, can_toggle_active)
select rp.role_id, 'warenwirtschaft', m.maske, 'write', m.toggle
from public.role_permissions rp
cross join (values ('adressen', true), ('kontakte', false), ('merkmal_laender', false)) as m (maske, toggle)
where rp.module = 'basis' and rp.maske = 'benutzerverwaltung'
on conflict (role_id, module, maske) do nothing;
