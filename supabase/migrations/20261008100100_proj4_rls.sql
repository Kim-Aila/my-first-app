-- PROJ-4: Row Level Security für Länder, Adressen und Kontakte.
-- Plan vom Nutzer freigegeben am 2026-10-08 (security.md: RLS-Änderungen brauchen ausdrückliche
-- Zustimmung): Adressen lesen = Maske Adressen ODER Artikelstamm; Kontakte lesen = nur Maske
-- Kontakte; Länder lesen = Maske Länder ODER Adressen. Schreiben immer nur mit Stufe "write" auf der
-- eigenen Maske. Auf keiner Tabelle existiert eine DELETE-Policy (nur deaktivieren).
-- Bestehende PROJ-1/2/3-Policies bleiben unverändert.

-- ---------------------------------------------------------------------------------------------
-- countries
-- ---------------------------------------------------------------------------------------------
alter table public.countries enable row level security;
alter table public.countries force row level security;

create policy "Laender readers see countries of their tenant" on public.countries
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_laender') is not null
    or public.mask_access_level(tenant_id, 'warenwirtschaft', 'adressen') is not null
  );
create policy "Laender writers insert countries" on public.countries
  for insert with check (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_laender') = 'write'
  );
create policy "Laender writers update countries" on public.countries
  for update
  using (public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_laender') = 'write')
  with check (public.mask_access_level(tenant_id, 'warenwirtschaft', 'merkmal_laender') = 'write');

-- ---------------------------------------------------------------------------------------------
-- addresses
-- ---------------------------------------------------------------------------------------------
alter table public.addresses enable row level security;
alter table public.addresses force row level security;

create policy "Adressen or Artikelstamm readers see addresses of their tenant" on public.addresses
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'adressen') is not null
    or public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') is not null
  );
create policy "Adressen writers insert addresses" on public.addresses
  for insert with check (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'adressen') = 'write'
  );
create policy "Adressen writers update addresses" on public.addresses
  for update
  using (public.mask_access_level(tenant_id, 'warenwirtschaft', 'adressen') = 'write')
  with check (public.mask_access_level(tenant_id, 'warenwirtschaft', 'adressen') = 'write');

-- ---------------------------------------------------------------------------------------------
-- contacts (personenbezogen: nur mit eigener Maske lesbar)
-- ---------------------------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.contacts force row level security;

create policy "Kontakte readers see contacts of their tenant" on public.contacts
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'kontakte') is not null
  );
create policy "Kontakte writers insert contacts" on public.contacts
  for insert with check (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'kontakte') = 'write'
  );
create policy "Kontakte writers update contacts" on public.contacts
  for update
  using (public.mask_access_level(tenant_id, 'warenwirtschaft', 'kontakte') = 'write')
  with check (public.mask_access_level(tenant_id, 'warenwirtschaft', 'kontakte') = 'write');
