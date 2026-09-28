-- Row Level Security: the database enforces tenant isolation itself (Tech Design decision #3),
-- not just the application layer. Super-admins bypass isolation via is_super_admin() (decision #4).
-- Note: the service_role key (used server-side only, e.g. by the login API route) bypasses RLS
-- entirely regardless of these policies — that is how failed-login tracking updates succeed
-- before a user has an authenticated session.

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

alter table public.user_tenant_access enable row level security;
alter table public.user_tenant_access force row level security;

alter table public.permissions enable row level security;
alter table public.permissions force row level security;

-- tenants
create policy "Super-admins see all tenants, users see their assigned tenants" on public.tenants
  for select using (public.is_super_admin() or public.has_tenant_access(id));

create policy "Only super-admins manage tenants (insert)" on public.tenants
  for insert with check (public.is_super_admin());

create policy "Only super-admins manage tenants (update)" on public.tenants
  for update using (public.is_super_admin());

create policy "Only super-admins manage tenants (delete)" on public.tenants
  for delete using (public.is_super_admin());

-- user_profiles
create policy "Super-admins see all profiles, users see their own" on public.user_profiles
  for select using (public.is_super_admin() or id = auth.uid());

create policy "Only super-admins manage profiles (insert)" on public.user_profiles
  for insert with check (public.is_super_admin());

create policy "Only super-admins manage profiles (update)" on public.user_profiles
  for update using (public.is_super_admin());

create policy "Only super-admins manage profiles (delete)" on public.user_profiles
  for delete using (public.is_super_admin());

-- user_tenant_access
create policy "Super-admins see all tenant access, users see their own" on public.user_tenant_access
  for select using (public.is_super_admin() or user_id = auth.uid());

create policy "Only super-admins manage tenant access (insert)" on public.user_tenant_access
  for insert with check (public.is_super_admin());

create policy "Only super-admins manage tenant access (update)" on public.user_tenant_access
  for update using (public.is_super_admin());

create policy "Only super-admins manage tenant access (delete)" on public.user_tenant_access
  for delete using (public.is_super_admin());

-- permissions
create policy "Super-admins see all permissions, users see their own" on public.permissions
  for select using (public.is_super_admin() or user_id = auth.uid());

create policy "Only super-admins manage permissions (insert)" on public.permissions
  for insert with check (public.is_super_admin());

create policy "Only super-admins manage permissions (update)" on public.permissions
  for update using (public.is_super_admin());

create policy "Only super-admins manage permissions (delete)" on public.permissions
  for delete using (public.is_super_admin());
