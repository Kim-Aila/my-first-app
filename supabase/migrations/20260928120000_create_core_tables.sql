-- PROJ-1: Multi-tenant foundation — tenants, user profiles, tenant access, permission scaffold

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Extends auth.users with the fields the app needs (username login, super-admin flag, lockout state).
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null,
  is_super_admin boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Many-to-many: a user can be granted access to multiple tenants.
create table public.user_tenant_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- Permission scaffold (User x Tenant x Module x Maske). Populated by PROJ-2; PROJ-1 only
-- establishes the shape so later features never need a schema migration to introduce it.
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid not null,
  module text not null,
  maske text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, module, maske),
  foreign key (user_id, tenant_id) references public.user_tenant_access (user_id, tenant_id) on delete cascade
);

create index idx_user_profiles_username on public.user_profiles (username);
create index idx_user_tenant_access_user_id on public.user_tenant_access (user_id);
create index idx_user_tenant_access_tenant_id on public.user_tenant_access (tenant_id);
create index idx_permissions_user_tenant on public.permissions (user_id, tenant_id);
