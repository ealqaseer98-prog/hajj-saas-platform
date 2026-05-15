// Role-based access: admin (full), coordinator (restricted), agent (full, legacy)
import type { AppUser } from '../types'

export const COORDINATOR_BLOCKED_PATHS = [
  '/accounting',
  '/accounts',
  '/reminders',
  '/adahi',
] as const

export function isCoordinator(role: AppUser['role'] | string | null | undefined): boolean {
  return role === 'coordinator'
}

export function isAdmin(role: AppUser['role'] | string | null | undefined): boolean {
  return role === 'admin'
}

export function isPathBlockedForCoordinator(pathname: string): boolean {
  return COORDINATOR_BLOCKED_PATHS.some(
    p => pathname === p || pathname.startsWith(`${p}/`)
  )
}

export function canAccessFinancePages(role: AppUser['role'] | string | null | undefined): boolean {
  return !isCoordinator(role)
}

export function canManageTravellers(role: AppUser['role'] | string | null | undefined): boolean {
  return !isCoordinator(role)
}

export function canManageVisa(role: AppUser['role'] | string | null | undefined): boolean {
  return !isCoordinator(role)
}

export function canManageDocuments(role: AppUser['role'] | string | null | undefined): boolean {
  return !isCoordinator(role)
}

export function filterNavItemsForRole<T extends { to: string }>(
  items: T[],
  role: AppUser['role'] | string | null | undefined
): T[] {
  if (!isCoordinator(role)) return items
  const blocked = new Set<string>(COORDINATOR_BLOCKED_PATHS)
  return items.filter(item => !blocked.has(item.to))
}

export function filterNavSectionsForRole<S extends { items: { to: string }[] }>(
  sections: S[],
  role: AppUser['role'] | string | null | undefined
): S[] {
  if (!isCoordinator(role)) return sections
  return sections
    .map(section => ({ ...section, items: filterNavItemsForRole(section.items, role) }))
    .filter(section => section.items.length > 0)
}
