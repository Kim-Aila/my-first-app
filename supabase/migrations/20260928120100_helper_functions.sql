-- Helper functions used by RLS policies.
-- SECURITY DEFINER + owned by a privileged role so they can read user_profiles / user_tenant_access
-- without recursing back into the RLS policies that call them (Supabase's documented pattern for
-- this). This is the single, auditable place where the super-admin bypass is decided (Tech Design
-- decision #4 in PROJ-1's spec).

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.user_profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.has_tenant_access(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_tenant_access
    where user_id = auth.uid() and tenant_id = check_tenant_id
  );
$$;
