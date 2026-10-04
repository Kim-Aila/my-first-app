-- PROJ-3: Row Level Security für Artikelstamm, Merkmal-Tabellen und Bearbeitungssperre.
-- Plan wurde vom Nutzer freigegeben (security.md: RLS-Änderungen brauchen ausdrückliche Zustimmung).
-- Bestehende PROJ-1/PROJ-2-Policies bleiben unverändert.
--
-- Rechte: ein User darf eine Maske in einem Mandanten lesen/schreiben, wenn eine seiner Rollen dort
-- das Maskenrecht mit passender Zugriffsstufe hat (`mask_access_level`). Super-Admins: immer "write".
-- Hartes Löschen gibt es nirgends: auf keiner PROJ-3-Tabelle existiert eine DELETE-Policy.

create or replace function public.mask_access_level(p_tenant_id uuid, p_module text, p_maske text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when public.is_super_admin() then 'write'
    else (
      select case
        when bool_or(rp.access_level = 'write') then 'write'
        when count(*) > 0 then 'read'
      end
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.user_profiles up on up.id = ur.user_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = p_tenant_id
        and up.is_active
        and rp.module = p_module
        and rp.maske = p_maske
    )
  end;
$$;

revoke execute on function public.mask_access_level(uuid, text, text) from public, anon;
grant execute on function public.mask_access_level(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------------------------
alter table public.articles enable row level security;
alter table public.articles force row level security;

create policy "Artikelstamm readers see articles of their tenant" on public.articles
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') is not null
  );
create policy "Artikelstamm writers insert articles" on public.articles
  for insert with check (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') = 'write'
  );
create policy "Artikelstamm writers update articles" on public.articles
  for update
  using (public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') = 'write')
  with check (public.mask_access_level(tenant_id, 'warenwirtschaft', 'artikelstamm') = 'write');

-- ---------------------------------------------------------------------------------------------
-- Merkmal-Tabellen: lesen darf, wer die eigene Merkmal-Maske ODER den Artikelstamm lesen darf
-- (das Artikelformular braucht die Bezeichnungen aller Merkmale). Anlegen/Ändern nur mit
-- Stufe "write" auf der eigenen Merkmal-Maske.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  entry text[];
begin
  foreach entry slice 1 in array array[
    array['article_types', 'merkmal_artikeltyp'],
    array['brand_owners', 'merkmal_markeninhaber'],
    array['seasons', 'merkmal_saison'],
    array['base_articles', 'merkmal_basisartikel'],
    array['form_designs', 'merkmal_form_design'],
    array['pack_sizes', 'merkmal_packungsgroesse'],
    array['flavors', 'merkmal_geschmackssorte'],
    array['vat_rates', 'merkmal_mwst'],
    array['packaging_groups', 'merkmal_verpackungsgruppe']
  ]
  loop
    execute format('alter table public.%I enable row level security', entry[1]);
    execute format('alter table public.%I force row level security', entry[1]);

    execute format(
      'create policy %I on public.%I for select using (
         public.mask_access_level(tenant_id, ''warenwirtschaft'', %L) is not null
         or public.mask_access_level(tenant_id, ''warenwirtschaft'', ''artikelstamm'') is not null
       )',
      'Mask readers see ' || entry[1], entry[1], entry[2]);

    execute format(
      'create policy %I on public.%I for insert with check (
         public.mask_access_level(tenant_id, ''warenwirtschaft'', %L) = ''write''
       )',
      'Mask writers insert ' || entry[1], entry[1], entry[2]);

    execute format(
      'create policy %I on public.%I for update
         using (public.mask_access_level(tenant_id, ''warenwirtschaft'', %L) = ''write'')
         with check (public.mask_access_level(tenant_id, ''warenwirtschaft'', %L) = ''write'')',
      'Mask writers update ' || entry[1], entry[1], entry[2], entry[2]);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Bearbeitungssperre: Tabellen sind für Clients komplett geschlossen (RLS ohne Policy). Zugriff
-- ausschließlich über die SECURITY DEFINER-Funktionen unten, die Berechtigung und Mandant prüfen.
-- ---------------------------------------------------------------------------------------------
alter table public.edit_lock_types enable row level security;
alter table public.edit_lock_types force row level security;
alter table public.edit_locks enable row level security;
alter table public.edit_locks force row level security;

-- Setzt oder verlängert die Sperre atomar (INSERT ... ON CONFLICT DO UPDATE ... WHERE): neu, bereits
-- die eigene, oder eine abgelaufene fremde Sperre → übernommen. Sonst bleibt die fremde Sperre
-- bestehen und der Halter wird zurückgegeben. Dauer: 15 Minuten ab jetzt.
create or replace function public.acquire_edit_lock(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns table (out_acquired boolean, out_holder_username text, out_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type public.edit_lock_types;
  v_row public.edit_locks;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select * into v_type from public.edit_lock_types where resource_type = p_resource_type;
  if not found then
    raise exception 'Unbekannter Datensatztyp.' using errcode = '22023';
  end if;

  if coalesce(public.mask_access_level(p_tenant_id, v_type.module, v_type.maske), '') <> 'write' then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = '42501';
  end if;

  -- Alte, längst abgelaufene Sperren mitaufräumen (kein separater Job nötig).
  delete from public.edit_locks where expires_at < now() - interval '1 day';

  insert into public.edit_locks as l (tenant_id, resource_type, resource_id, user_id, locked_at, expires_at)
  values (p_tenant_id, p_resource_type, p_resource_id, v_user, now(), now() + interval '15 minutes')
  on conflict (tenant_id, resource_type, resource_id) do update
    set user_id = excluded.user_id,
        locked_at = case
          when l.user_id = excluded.user_id and l.expires_at > now() then l.locked_at
          else excluded.locked_at
        end,
        expires_at = excluded.expires_at
    where l.user_id = excluded.user_id or l.expires_at <= now()
  returning * into v_row;

  if found then
    return query select true, null::text, v_row.expires_at;
    return;
  end if;

  return query
    select false, up.username, l.expires_at
    from public.edit_locks l
    join public.user_profiles up on up.id = l.user_id
    where l.tenant_id = p_tenant_id
      and l.resource_type = p_resource_type
      and l.resource_id = p_resource_id;
end;
$$;

-- Gibt nur die EIGENE Sperre frei (idempotent).
create or replace function public.release_edit_lock(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.edit_locks
  where tenant_id = p_tenant_id
    and resource_type = p_resource_type
    and resource_id = p_resource_id
    and user_id = auth.uid();
$$;

-- Liefert die aktuell gültige Sperre (für die Anzeige "wird gerade von X bearbeitet").
-- Nur für Mitglieder des Mandanten; sonst leer.
create or replace function public.get_edit_lock(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns table (out_user_id uuid, out_username text, out_expires_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select l.user_id, up.username, l.expires_at
  from public.edit_locks l
  join public.user_profiles up on up.id = l.user_id
  where public.has_tenant_access(p_tenant_id)
    and l.tenant_id = p_tenant_id
    and l.resource_type = p_resource_type
    and l.resource_id = p_resource_id
    and l.expires_at > now();
$$;

revoke execute on function public.acquire_edit_lock(uuid, text, uuid) from public, anon;
revoke execute on function public.release_edit_lock(uuid, text, uuid) from public, anon;
revoke execute on function public.get_edit_lock(uuid, text, uuid) from public, anon;
grant execute on function public.acquire_edit_lock(uuid, text, uuid) to authenticated;
grant execute on function public.release_edit_lock(uuid, text, uuid) to authenticated;
grant execute on function public.get_edit_lock(uuid, text, uuid) to authenticated;
