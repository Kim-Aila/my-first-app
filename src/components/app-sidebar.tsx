"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2,
  ChevronRight,
  ChevronsUpDown,
  House,
  ListTree,
  LogOut,
  Package,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useConfirmLeave } from "@/components/unsaved-changes-provider"

interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export interface AppSidebarProps {
  username: string
  isSuperAdmin: boolean
  canManageUsers: boolean
  /** Warenwirtschaft: nur Einträge, für die der User in mindestens einem Mandanten ein Recht hat. */
  canViewArticles: boolean
  merkmalItems: { title: string; href: string }[]
}

function getInitials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return initials.toUpperCase()
}

function BrandMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-primary-foreground"
        aria-hidden="true"
      >
        <ellipse cx="12" cy="12" rx="6" ry="9" />
        <path d="M12 3c-2 4-2 14 0 18" />
      </svg>
    </div>
  )
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.title}
              className="data-[active=true]:border data-[active=true]:border-sidebar-border data-[active=true]:bg-card data-[active=true]:font-medium data-[active=true]:shadow-sm"
            >
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (isMobile) setOpenMobile(false)
                }}
              >
                <item.icon aria-hidden="true" />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function MerkmaleMenu({
  items,
  pathname,
}: {
  items: { title: string; href: string }[]
  pathname: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const hasActive = items.some((item) => pathname.startsWith(item.href))
  const [open, setOpen] = React.useState(hasActive)

  // Beim Navigieren zu einer Merkmal-Maske den Bereich aufklappen.
  React.useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip="Merkmale">
            <ListTree aria-hidden="true" />
            <span>Merkmale</span>
            <ChevronRight
              aria-hidden="true"
              className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={isActive}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false)
                      }}
                    >
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function AppSidebar({
  username,
  isSuperAdmin,
  canManageUsers,
  canViewArticles,
  merkmalItems,
}: AppSidebarProps) {
  const pathname = usePathname()
  const confirmLeave = useConfirmLeave()

  async function handleLogout() {
    // Ungespeicherte Änderungen in einer Maske: erst Speichern/Verwerfen/Abbrechen abfragen.
    if (!(await confirmLeave())) return
    try {
      // Die Route antwortet mit 307 → /login. "manual", damit fetch dem Redirect nicht
      // (per 307 weiterhin als POST) folgt; die Navigation übernimmt window.location.
      await fetch("/api/auth/logout", { method: "POST", redirect: "manual" })
      window.location.href = "/login"
    } catch {
      toast.error("Abmelden fehlgeschlagen", {
        description: "Der Server ist nicht erreichbar. Bitte versuche es erneut.",
      })
    }
  }

  const mainItems: NavItem[] = [{ title: "Startseite", href: "/", icon: House }]

  const warenItems: NavItem[] = []
  if (canViewArticles) {
    warenItems.push({ title: "Artikelstamm", href: "/artikelstamm", icon: Package })
  }

  const adminItems: NavItem[] = []
  if (canManageUsers || isSuperAdmin) {
    adminItems.push({ title: "Benutzerverwaltung", href: "/benutzerverwaltung", icon: Users })
  }
  if (isSuperAdmin) {
    adminItems.push({ title: "Mandanten", href: "/mandanten", icon: Building2 })
    adminItems.push({
      title: "Globale Benutzerverwaltung",
      href: "/globale-benutzer",
      icon: ShieldCheck,
    })
  }

  const accountItems: NavItem[] = [{ title: "Profil", href: "/profil", icon: UserRound }]

  return (
    <Sidebar collapsible="icon" aria-label="Hauptnavigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <BrandMark />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-display text-base font-medium">
                    Manufaktur-ERP
                  </span>
                  <span className="truncate text-xs text-muted-foreground">Schokoladenfabrik</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Seiten">
          <SidebarGroup>
            <SidebarGroupContent>
              <NavList items={mainItems} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>

          {(warenItems.length > 0 || merkmalItems.length > 0) && (
            <SidebarGroup>
              <SidebarGroupLabel>Warenwirtschaft</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {warenItems.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className="data-[active=true]:border data-[active=true]:border-sidebar-border data-[active=true]:bg-card data-[active=true]:font-medium data-[active=true]:shadow-sm"
                        >
                          <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                            <item.icon aria-hidden="true" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                  {merkmalItems.length > 0 && (
                    <MerkmaleMenu items={merkmalItems} pathname={pathname} />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {adminItems.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavList items={adminItems} pathname={pathname} />
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarGroup>
            <SidebarGroupLabel>Konto</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavList items={accountItems} pathname={pathname} />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="bg-[#E6DACB] hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent dark:bg-sidebar-accent"
                  aria-label={`Benutzermenü für ${username}`}
                >
                  <Avatar className="h-8 w-8 rounded-full">
                    <AvatarFallback className="bg-[#6B4A3A] text-xs font-semibold text-primary-foreground">
                      {getInitials(username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{username}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isSuperAdmin ? "Super-Admin" : "Angemeldet"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profil">
                    <UserRound className="mr-2 size-4" aria-hidden="true" />
                    Profil &amp; Passwort
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Kein natives <form>: Radix schließt/unmountet das Menü beim Auswählen,
                    bevor ein Form-Submit abgeschickt wird (BUG-1). */}
                <DropdownMenuItem className="cursor-pointer" onSelect={handleLogout}>
                  <LogOut className="mr-2 size-4" aria-hidden="true" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
