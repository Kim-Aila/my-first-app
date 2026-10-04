import type { MaskPermission } from "@/lib/masks"

export interface TenantUser {
  id: string
  username: string
  email: string
  isActive: boolean
  isLocked: boolean
  roleIds: string[]
}

export interface TenantRole {
  id: string
  name: string
  masks: MaskPermission[]
  userCount: number
}
