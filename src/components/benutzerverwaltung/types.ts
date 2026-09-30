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
  masks: { module: string; maske: string }[]
  userCount: number
}
