-- PROJ-5: Row Level Security, Sichten und Standardrechte für den Lagerbestand.
-- Plan vom Nutzer freigegeben am 2026-10-11 (security.md: RLS-Änderungen brauchen ausdrückliche
-- Zustimmung):
--  * Lesen der Tabellen: Maske "Lagerbestand" (Stufe read oder write) im eigenen Mandanten.
--  * Schreiben: gar nicht direkt — es gibt keine INSERT/UPDATE/DELETE-Policy und die Tabellenrechte
--    sind entzogen. Änderungen laufen nur über stock_import / stock_check_position /
--    stock_ship_position / stock_cleanup (Migration 20261011100000).
--  * Die Sichten stock_position_list und stock_by_article laufen mit Eigentümerrechten, damit
--    Leser des Lagerbestands Artikelnamen und Prüfer-Namen sehen, ohne Leserecht auf den
--    Artikelstamm bzw. die Benutzer zu haben. Sie filtern selbst: die Maskenprüfung greift je Zeile
--    für den Mandanten dieser Zeile, Zeilen anderer Mandanten bleiben also unsichtbar.
-- Bestehende PROJ-1–4-Policies bleiben unverändert.

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
alter table public.stock_imports enable row level security;
alter table public.stock_imports force row level security;
alter table public.stock_positions enable row level security;
alter table public.stock_positions force row level security;
alter table public.stock_import_positions enable row level security;
alter table public.stock_import_positions force row level security;

create policy "Lagerbestand readers see imports of their tenant" on public.stock_imports
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'lagerbestand') is not null
  );
create policy "Lagerbestand readers see positions of their tenant" on public.stock_positions
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'lagerbestand') is not null
  );
create policy "Lagerbestand readers see import history of their tenant" on public.stock_import_positions
  for select using (
    public.mask_access_level(tenant_id, 'warenwirtschaft', 'lagerbestand') is not null
  );

-- Zweite Verteidigungslinie neben dem Fehlen von Schreib-Policies.
revoke all on public.stock_imports, public.stock_positions, public.stock_import_positions from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.stock_imports, public.stock_positions, public.stock_import_positions from authenticated;
grant select on public.stock_imports, public.stock_positions, public.stock_import_positions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sichten (Eigentümerrechte, bewusst NICHT security_invoker — siehe Kopf)
-- ---------------------------------------------------------------------------------------------

-- LHM-Positionen mit Artikelzuordnung über die Artikelnummer (leer bei unbekanntem Artikel),
-- abgeleiteter Mischpalette (SSCC hat weitere Positionen) und Namen von Prüfer/Buchendem.
create view public.stock_position_list with (security_invoker = false) as
select
  p.id,
  p.tenant_id,
  p.sscc,
  p.article_number,
  a.id as article_id,
  a.name as article_name,
  p.quantity,
  p.free_quantity,
  p.qs_quantity,
  p.blocked_quantity,
  p.qs_and_blocked_quantity,
  p.unit,
  p.logistics_center,
  p.stock_group,
  p.status,
  exists (
    select 1 from public.stock_positions o
    where o.tenant_id = p.tenant_id and o.sscc = p.sscc and o.id <> p.id
  ) as is_mixed_pallet,
  p.checked_by,
  cu.username as checked_by_name,
  p.checked_at,
  p.check_remark,
  p.shipped_by,
  su.username as shipped_by_name,
  p.shipped_at,
  p.first_seen_at,
  p.last_seen_at,
  p.updated_at,
  p.last_import_id
from public.stock_positions p
left join public.articles a on a.tenant_id = p.tenant_id and a.article_number = p.article_number
left join public.user_profiles cu on cu.id = p.checked_by
left join public.user_profiles su on su.id = p.shipped_by
where public.mask_access_level(p.tenant_id, 'warenwirtschaft', 'lagerbestand') is not null;

-- Bestand je Artikel: Summe über Positionen "Im Lager" (Fehlt/Versendet gehen nicht ein).
--   Bestand = Σ menge, Gesperrt QS = Σ qsMenge, Gesperrt = Σ sperrMenge,
--   Gesperrt gesamt = Σ qsUndSperrMenge, Verfügbar = Σ freieMenge
create view public.stock_by_article with (security_invoker = false) as
select
  p.tenant_id,
  p.article_number,
  a.id as article_id,
  a.name as article_name,
  sum(p.quantity) as stock,
  sum(p.qs_quantity) as qs_blocked,
  sum(p.blocked_quantity) as blocked,
  sum(p.qs_and_blocked_quantity) as blocked_total,
  sum(p.free_quantity) as available
from public.stock_positions p
left join public.articles a on a.tenant_id = p.tenant_id and a.article_number = p.article_number
where p.status = 'in_stock'
  and public.mask_access_level(p.tenant_id, 'warenwirtschaft', 'lagerbestand') is not null
group by p.tenant_id, p.article_number, a.id, a.name;

revoke all on public.stock_position_list, public.stock_by_article from public, anon;
grant select on public.stock_position_list, public.stock_by_article to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Standardrechte (Nutzerentscheidung): Rollen mit der Maske Benutzerverwaltung (= Mandanten-
-- Admins) erhalten "Lagerbestand" mit "Lesen + Bearbeiten". Alle anderen Rollen vergibt der
-- Mandanten-Admin im Rollen-Dialog.
-- ---------------------------------------------------------------------------------------------
insert into public.role_permissions (role_id, module, maske, access_level)
select rp.role_id, 'warenwirtschaft', 'lagerbestand', 'write'
from public.role_permissions rp
where rp.module = 'basis' and rp.maske = 'benutzerverwaltung'
on conflict (role_id, module, maske) do nothing;
