/** True, wenn die Login-Sperre aus PROJ-1 (`locked_until`) aktuell noch greift. */
export function isCurrentlyLocked(lockedUntil: string | null | undefined): boolean {
  if (!lockedUntil) return false
  const until = new Date(lockedUntil).getTime()
  return !Number.isNaN(until) && until > Date.now()
}
