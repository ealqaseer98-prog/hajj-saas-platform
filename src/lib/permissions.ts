// Role-based access: admin (full), coordinator (restricted), driver (cars only), agent (full, legacy)
import type { AppUser } from '../types'

export const DRIVER_ALLOWED_PATHS = ['/cars', '/dashboard'] as const

export const COORDINATOR_BLOCKED_PATHS = [
  '/accounting',
  '/accounts',
  '/reminders',
  '/adahi',
  '/documents',
  '/notifications',
] as const

export function isDriver(role: AppUser['role'] | string | null | undefined): boolean {
  return role === 'driver'
}

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

export function isPathAllowedForDriver(pathname: string): boolean {
  return DRIVER_ALLOWED_PATHS.some(
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

export function canAccessRoomRequests(role: AppUser['role'] | string | null | undefined): boolean {
  return role === 'admin' || role === 'coordinator'
}

export function filterNavItemsForRole<T extends { to: string }>(
  items: T[],
  role: AppUser['role'] | string | null | undefined
): T[] {
  if (isDriver(role)) {
    return items.filter(item => item.to === '/cars')
  }
  let filtered = items.filter(
    item => item.to !== '/room-requests' || canAccessRoomRequests(role)
  )
  if (!isCoordinator(role)) return filtered
  const blocked = new Set<string>(COORDINATOR_BLOCKED_PATHS)
  return filtered.filter(item => !blocked.has(item.to))
}

export function filterNavSectionsForRole<S extends { label: string; items: { to: string }[] }>(
  sections: S[],
  role: AppUser['role'] | string | null | undefined
): S[] {
  if (isDriver(role)) {
    const carsItems = filterNavItemsForRole(sections.flatMap(s => s.items), role)
    if (carsItems.length === 0) return []
    return [{ ...sections[0], label: 'السيارات', items: carsItems } as S]
  }
  if (!isCoordinator(role)) return sections
  return sections
    .map(section => ({ ...section, items: filterNavItemsForRole(section.items, role) }))
    .filter(section => section.items.length > 0)
}
