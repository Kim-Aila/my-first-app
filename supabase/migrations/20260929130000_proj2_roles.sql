-- PROJ-2: Role-based permission model (roles bundle masks, users get roles per tenant).
-- Replaces the never-populated PROJ-1 permission scaffold with the real role-based model.
drop table if exists public.permissions;

-- Global (de)activation — a deactivated user can no longer log in to any tenant.
alter table public.user_profiles add column is_active boolean not null default true;

alter table public.tenants add constraint tenants_name_key unique (name);

-- A role belongs to exactly one tenant; its name is unique within that tenant.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Which masks (module + maske) a role unlocks. No separate mask registry: future modules
-- simply introduce new module/maske values (see src/lib/masks.ts).
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  module text not null,
  maske text not null,
  unique (role_id, module, maske)
);

-- Composite FK to user_tenant_access: removing a user's tenant access automatically
-- removes their role assignments in that tenant (no orphaned rows, no extra app code).
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid not null,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, role_id),
  foreign key (user_id, tenant_id) references public.user_tenant_access (user_id, tenant_id) on delete cascade
);

create index idx_roles_tenant_id on public.roles (tenant_id);
create index idx_role_permissions_role_id on public.role_permissions (role_id);
create index idx_user_roles_user_id on public.user_roles (user_id);
create index idx_user_roles_tenant_id on public.user_roles (tenant_id);
create index idx_user_roles_role_id on public.user_roles (role_id);
