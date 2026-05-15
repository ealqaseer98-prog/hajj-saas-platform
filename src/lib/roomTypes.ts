import type { RoomType } from '../types'

export const ROOM_TYPE_AR: Record<RoomType, string> = {
  single: 'مفردة',
  double: 'مزدوجة',
  triple: 'ثلاثية',
  quad: 'رباعية',
  quint: 'خماسية',
  sextuple: 'سداسية',
}

export const ROOM_TYPE_CAPACITY: Record<RoomType, number> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  quint: 5,
  sextuple: 6,
}

export function roomTypeLabel(type: string | undefined | null): string {
  if (!type) return '—'
  return ROOM_TYPE_AR[type as RoomType] ?? type
}
