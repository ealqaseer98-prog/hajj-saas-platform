// src/lib/scanPassport.ts
import { supabase } from './supabase'

export type ScannedPassport = {
  full_name_en?: string | null
  full_name_ar?: string | null
  passport_number?: string | null
  cpr_number?: string | null
  nationality?: string | null
  date_of_birth?: string | null
  gender?: string | null
  expiry_date?: string | null
  passport_issue_date?: string | null
  passport_expiry_date?: string | null
}

export function dateOrNull(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  return v ? v.slice(0, 10) : null
}

export const SCAN_PASSPORT_ERROR_AR =
  'تعذر قراءة الجواز، يرجى المحاولة مرة أخرى أو الإدخال يدوياً'

export function normalizePassport(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '').toUpperCase()
}

export function fileToBase64(file: File): Promise<{ image: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const comma = dataUrl.indexOf(',')
      const image = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl.replace(/^data:[^;]+;base64,/, '')
      resolve({ image, mediaType: file.type || 'image/jpeg' })
    }
    reader.onerror = () => reject(new Error('read-failed'))
    reader.readAsDataURL(file)
  })
}

export async function scanPassportFile(file: File): Promise<ScannedPassport> {
  const { image, mediaType } = await fileToBase64(file)
  const res = await fetch('/api/scan-passport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mediaType }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success || !json.data) {
    throw new Error('scan-failed')
  }
  return json.data as ScannedPassport
}

export async function findRowByPassport<T extends { id: string; passport_number?: string | null }>(
  table: 'travellers' | 'umrah_travellers',
  passport: string,
  excludeId?: string,
): Promise<T | null> {
  const target = normalizePassport(passport)
  if (!target) return null
  const { data } = await supabase.from(table).select('*').not('passport_number', 'is', null)
  const match = ((data ?? []) as T[]).find(row =>
    normalizePassport(row.passport_number) === target && row.id !== excludeId
  )
  return match ?? null
}
