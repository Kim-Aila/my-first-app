-- PROJ-2 QA bugfixes (2026-09-30): BUG-2, BUG-4, BUG-9, BUG-10, BUG-11.
-- Changes to RLS helper functions were explicitly approved by the user (security.md review trigger).

-- ---------------------------------------------------------------------------------------------
-- BUG-2: global deactivation must be enforced at the RLS layer, not only in the app's login
-- route. Every RLS policy routes through one of these three SECURITY DEFINER helpers, so adding
-- the caller's own `is_active` check here closes the gap for every session, however obtained
-- (existing browser session, direct GoTrue password grant with the anon key, ...).
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_super_admin and is_active from public.user_profiles where id = auth.uid()),
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
    select 1
    from public.user_tenant_access uta
    join public.user_profiles up on up.id = uta.user_id
    where uta.user_id = auth.uid()
      and uta.tenant_id = check_tenant_id
      and up.is_active
  );
$$;

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
    join public.user_profiles up on up.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = check_tenant_id
      and up.is_active
      and rp.module = 'basis'
      and rp.maske = 'benutzerverwaltung'
  );
$$;

-- Defense in depth for BUG-2: when a profile is deactivated (by any client — API route or a
-- super-admin's direct REST call), end all of that user's GoTrue sessions immediately. Deleting
-- auth.sessions cascades to auth.refresh_tokens (no new access tokens) and GoTrue rejects the
-- still-unexpired access token with `session_not_found` (verified live), so the Next.js
-- middleware's getUser() fails and the browser is sent to /login.
-- (supabase-js' `auth.admin.signOut()` takes the *user's JWT*, not a user id, so it cannot be
-- used by a super-admin to sign out someone else — hence this trigger.)
create or replace function public.revoke_sessions_on_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.sessions where user_id = new.id;
  return new;
end;
$$;

revoke execute on function public.revoke_sessions_on_deactivation() from public, anon, authenticated;

create trigger user_profiles_revoke_sessions_on_deactivation
  after update of is_active on public.user_profiles
  for each row
  when (old.is_active and not new.is_active)
  execute function public.revoke_sessions_on_deactivation();

-- ---------------------------------------------------------------------------------------------
-- BUG-4: atomic "last *active* super-admin" guard.
-- Only *active* super-admins count. A single UPDATE with a count subquery is NOT enough under
-- READ COMMITTED: two super-admins revoking *each other* update different rows, so neither
-- blocks the other and both subqueries still see the other one as active (reproduced live: 0
-- super-admins left in 3/5 concurrent PostgREST rounds even with only an advisory lock in front
-- of such an UPDATE). Therefore the remaining active super-admins are row-locked with
-- SELECT ... FOR UPDATE: this waits for any concurrent revoke/deactivation of those rows to
-- commit and then re-checks each row's *latest* version, so the count is always current.
-- The advisory lock in front keeps concurrent revokes strictly serialized (no deadlocks from
-- different row-lock orders).
-- ---------------------------------------------------------------------------------------------
create or replace function public.revoke_super_admin(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  affected int;
begin
  -- SECURITY DEFINER bypasses RLS, so authorization must be checked explicitly here
  -- (otherwise any authenticated user could call this via PostgREST /rpc).
  if not public.is_super_admin() then
    raise exception 'Only super-admins may revoke the super-admin flag'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.revoke_super_admin'));

  select count(*) into remaining
  from (
    select id from public.user_profiles
    where is_super_admin and is_active and id <> target_id
    order by id
    for update
  ) others;

  if remaining < 1 then
    return false;
  end if;

  update public.user_profiles
  set is_super_admin = false
  where id = target_id
    and is_super_admin = true;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke execute on function public.revoke_super_admin(uuid) from public, anon;
grant execute on function public.revoke_super_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- BUG-9: a role assignment must reference a role of the *same* tenant, regardless of which
-- client performs the write (API route already checks this; now the database does too).
-- ---------------------------------------------------------------------------------------------
alter table public.roles add constraint roles_id_tenant_id_key unique (id, tenant_id);
alter table public.user_roles
  add constraint user_roles_role_tenant_fk foreign key (role_id, tenant_id)
  references public.roles (id, tenant_id) on delete cascade;
-- The composite FK fully supersedes the original single-column FK (same ON DELETE CASCADE, plus
-- the tenant match). Keeping both would give PostgREST two user_roles → roles relationships and
-- make every `user_roles?select=...,roles(...)` embed fail with PGRST201 (ambiguous embedding).
alter table public.user_roles drop constraint user_roles_role_id_fkey;

-- ---------------------------------------------------------------------------------------------
-- BUG-10 / BUG-11: case-insensitive uniqueness enforced by the database. The API routes no
-- longer pre-check with an `ilike` pattern built from raw input (which misread `*` as a
-- wildcard); they rely on these indexes and map unique_violation (23505) to 409.
-- Login keeps its exact-case username lookup; only uniqueness becomes case-insensitive.
-- ---------------------------------------------------------------------------------------------
create unique index tenants_name_lower_key on public.tenants (lower(name));
create unique index roles_tenant_name_lower_key on public.roles (tenant_id, lower(name));
create unique index user_profiles_username_lower_key on public.user_profiles (lower(username));
