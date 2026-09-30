-- PROJ-2: Row Level Security for the role model + tenant-admin read/delete access.
-- A "tenant admin" is not a flag: it is any user holding a role with the mask
-- basis/benutzerverwaltung in that tenant (Tech Design decision #2). Super-admins always qualify.
-- Existing PROJ-1 policies stay untouched; the policies below are additive (Postgres ORs
-- multiple permissive policies together).

create or replace function public.has_tenant_admin_access(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = check_tenant_id
      and rp.module = 'basis'
      and rp.maske = 'benutzerverwaltung'
  );
$$;

-- user_profiles: tenant admins may read the profiles of users in their tenant.
create policy "Tenant admins see profiles of users in their tenant" on public.user_profiles
  for select using (
    exists (
      select 1 from public.user_tenant_access uta
      where uta.user_id = user_profiles.id
        and public.has_tenant_admin_access(uta.tenant_id)
    )
  );

-- user_tenant_access: tenant admins may read and remove access rows of their own tenant.
-- (The read policy is required so the tenant user list — and the removal itself — can see the
-- rows; without it, a tenant admin only sees their own access row via the PROJ-1 policy.)
create policy "Tenant admins see tenant access of their own tenant" on public.user_tenant_access
  for select using (public.has_tenant_admin_access(tenant_id));

-- Deliberately NOT adding an insert policy for user_tenant_access — a tenant admin must
-- never be able to attach an *existing* arbitrary user to their tenant via a direct REST
-- call, only ever a brand-new one via our API (which uses the service-role admin client).
create policy "Tenant admins remove users from their own tenant" on public.user_tenant_access
  for delete using (public.has_tenant_admin_access(tenant_id));

-- New tables
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;

-- roles
create policy "Tenant admins manage roles, users see their own assigned roles" on public.roles
  for select using (
    public.has_tenant_admin_access(tenant_id)
    or exists (select 1 from public.user_roles ur where ur.role_id = roles.id and ur.user_id = auth.uid())
  );
create policy "Tenant admins insert roles" on public.roles
  for insert with check (public.has_tenant_admin_access(tenant_id));
create policy "Tenant admins update roles" on public.roles
  for update using (public.has_tenant_admin_access(tenant_id));
create policy "Tenant admins delete roles" on public.roles
  for delete using (public.has_tenant_admin_access(tenant_id));

-- role_permissions
create policy "Visible if the parent role is visible" on public.role_permissions
  for select using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (
          public.has_tenant_admin_access(r.tenant_id)
          or exists (select 1 from public.user_roles ur where ur.role_id = r.id and ur.user_id = auth.uid())
        )
    )
  );
create policy "Tenant admins insert role permissions" on public.role_permissions
  for insert with check (
    exists (select 1 from public.roles r where r.id = role_permissions.role_id and public.has_tenant_admin_access(r.tenant_id))
  );
create policy "Tenant admins update role permissions" on public.role_permissions
  for update using (
    exists (select 1 from public.roles r where r.id = role_permissions.role_id and public.has_tenant_admin_access(r.tenant_id))
  );
create policy "Tenant admins delete role permissions" on public.role_permissions
  for delete using (
    exists (select 1 from public.roles r where r.id = role_permissions.role_id and public.has_tenant_admin_access(r.tenant_id))
  );

-- user_roles
create policy "Own assignments or tenant admin" on public.user_roles
  for select using (user_id = auth.uid() or public.has_tenant_admin_access(tenant_id));
create policy "Tenant admins insert role assignments" on public.user_roles
  for insert with check (public.has_tenant_admin_access(tenant_id));
create policy "Tenant admins delete role assignments" on public.user_roles
  for delete using (public.has_tenant_admin_access(tenant_id));
