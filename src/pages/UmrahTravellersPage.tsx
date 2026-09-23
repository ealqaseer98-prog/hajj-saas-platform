// src/pages/UmrahTravellersPage.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Search, Plus, Edit2, Trash2, UserCheck, AlertCircle, ScanLine } from 'lucide-react'
import type { UmrahTraveller, Gender } from '../types'
import { nationalitySelectOptions } from '../lib/nationalitiesAr'

type ScannedPassport = {
  full_name_en?: string | null
  full_name_ar?: string | null
  passport_number?: string | null
  cpr_number?: string | null
  nationality?: string | null
  date_of_birth?: string | null
  gender?: string | null
  passport_issue_date?: string | null
  passport_expiry_date?: string | null
}

function normalizePassport(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '').toUpperCase()
}

function applyScannedFields(current: Partial<UmrahTraveller>, scanned: ScannedPassport): Partial<UmrahTraveller> {
  const next = { ...current }
  if (scanned.full_name_ar) next.full_name_ar = scanned.full_name_ar
  if (scanned.full_name_en) next.full_name_en = scanned.full_name_en
  if (scanned.passport_number) next.passport_number = scanned.passport_number
  if (scanned.cpr_number) next.cpr_number = scanned.cpr_number
  if (scanned.nationality) next.nationality = scanned.nationality
  if (scanned.date_of_birth) next.date_of_birth = scanned.date_of_birth.slice(0, 10)
  if (scanned.gender === 'male' || scanned.gender === 'female') next.gender = scanned.gender
  if (scanned.passport_issue_date) next.passport_issue_date = scanned.passport_issue_date.slice(0, 10)
  if (scanned.passport_expiry_date) next.passport_expiry_date = scanned.passport_expiry_date.slice(0, 10)
  return next
}

async function findTravellerByPassport(passport: string, excludeId?: string) {
  const target = normalizePassport(passport)
  if (!target) return null
  const { data } = await supabase
    .from('umrah_travellers')
    .select('*')
    .not('passport_number', 'is', null)
  const match = ((data ?? []) as UmrahTraveller[]).find(t =>
    normalizePassport(t.passport_number) === target && t.id !== excludeId
  )
  return match ?? null
}

function fileToBase64(file: File): Promise<{ image: string; mediaType: string }> {
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

function genderCfg(gender: string | null | undefined) {
  if (gender === 'male') return { label: 'ذكر', className: 'bg-blue-50 text-blue-700' }
  if (gender === 'female') return { label: 'أنثى', className: 'bg-pink-50 text-pink-700' }
  return { label: '—', className: 'text-gray-400' }
}

function buildSavePayload(t: Partial<UmrahTraveller>) {
  return {
    full_name_ar: t.full_name_ar,
    full_name_en: t.full_name_en || null,
    cpr_number: t.cpr_number || null,
    passport_number: t.passport_number || null,
    passport_issue_date: t.passport_issue_date || null,
    passport_expiry_date: t.passport_expiry_date || null,
    phone: t.phone || null,
    gender: t.gender ?? null,
    date_of_birth: t.date_of_birth || null,
    nationality: t.nationality || null,
    notes: t.notes || null,
  }
}

const EMPTY: Partial<UmrahTraveller> = {
  full_name_ar: '', full_name_en: '', cpr_number: '', passport_number: '',
  phone: '', gender: null, nationality: '', notes: '',
}

export default function UmrahTravellersPage() {
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Partial<UmrahTraveller>>(EMPTY)

  const { data: travellers = [], isLoading } = useQuery({
    queryKey: ['umrah-travellers', search],
    queryFn: async () => {
      let q = supabase.from('umrah_travellers').select('*').order('full_name_ar')
      if (search.trim()) {
        q = q.or(
          `full_name_ar.ilike.%${search}%,full_name_en.ilike.%${search}%,cpr_number.ilike.%${search}%,passport_number.ilike.%${search}%`
        )
      }
      const { data } = await q
      return (data ?? []) as UmrahTraveller[]
    },
  })

  const save = useMutation({
    mutationFn: async (t: Partial<UmrahTraveller>) => {
      const payload = buildSavePayload(t)
      if (modal === 'add') {
        await supabase.from('umrah_travellers').insert(payload).throwOnError()
      } else {
        const { id } = t as UmrahTraveller
        await supabase.from('umrah_travellers').update(payload).eq('id', id).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-travellers'] })
      setModal(null)
      setSelected(EMPTY)
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('umrah_travellers').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-travellers'] }),
  })

  const openEdit = (t: UmrahTraveller) => {
    setSelected(t)
    setModal('edit')
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">المسافرون (العمرة)</h1>
          <p className="text-sm text-gray-500 mt-1">الإجمالي: {travellers.length}</p>
        </div>
        <button
          onClick={() => { setSelected(EMPTY); setModal('add') }}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> إضافة مسافر
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="ابحث بالاسم أو رقم البطاقة أو جواز السفر..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">جارٍ التحميل...</div>
        ) : travellers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <UserCheck size={40} className="mx-auto mb-3 opacity-30" />
            لا يوجد مسافرون
          </div>
        ) : (
          <>
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الاسم بالعربية</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الجنس</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">رقم البطاقة</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الهاتف</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">جواز السفر</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {travellers.map(t => {
                const genderBadge = genderCfg(t.gender)
                return (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">{t.full_name_ar}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${genderBadge.className}`}>
                      {genderBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{t.cpr_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{t.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{t.passport_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"><Edit2 size={15} /></button>
                      <button onClick={() => window.confirm('هل أنت متأكد من الحذف؟') && del.mutate(t.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <div className="md:hidden p-3 space-y-3">
            {travellers.map(t => (
              <div key={t.id} className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800">{t.full_name_ar}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${genderCfg(t.gender).className}`}>
                    {genderCfg(t.gender).label}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-sm text-gray-600">
                  <p><span className="text-gray-500">رقم البطاقة: </span><span className="font-mono">{t.cpr_number ?? '—'}</span></p>
                  <p><span className="text-gray-500">الهاتف: </span><span className="font-mono">{t.phone ?? '—'}</span></p>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button onClick={() => openEdit(t)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="تعديل"><Edit2 size={15} /></button>
                  <button onClick={() => window.confirm('هل أنت متأكد من الحذف؟') && del.mutate(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {modal && (
        <TravellerModal
          mode={modal} data={selected} onChange={setSelected}
          onSave={() => save.mutate(selected)}
          onClose={() => { setModal(null); setSelected(EMPTY) }}
          saving={save.isPending} error={save.error?.message}
          onScanned={async scanned => {
            const existing = scanned.passport_number
              ? await findTravellerByPassport(scanned.passport_number, selected.id)
              : null
            if (existing) {
              const updateExisting = window.confirm(
                'يوجد مسافر مسجّل بنفس رقم الجواز. هل تريد تحديث بياناته بدلاً من إضافة مسافر جديد؟'
              )
              if (updateExisting) {
                setModal('edit')
                setSelected(applyScannedFields(existing, scanned))
                return
              }
            }
            setSelected(s => applyScannedFields(s, scanned))
          }}
        />
      )}
    </div>
  )
}

interface ModalProps {
  mode: 'add' | 'edit'; data: Partial<UmrahTraveller>
  onChange: (t: Partial<UmrahTraveller>) => void
  onSave: () => void; onClose: () => void
  saving: boolean; error?: string
  onScanned: (fields: ScannedPassport) => Promise<void>
}

function TravellerModal({ mode, data, onChange, onSave, onClose, saving, error, onScanned }: ModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const f = (field: keyof UmrahTraveller) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...data, [field]: e.target.value })

  const setGender = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onChange({ ...data, gender: value === '' ? null : (value as Gender) })
  }

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanError(null)
    setScanning(true)
    try {
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
      await onScanned(json.data as ScannedPassport)
    } catch {
      setScanError('تعذر قراءة الجواز، يرجى المحاولة مرة أخرى أو الإدخال يدوياً')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
        <h2 className="text-lg font-bold text-gray-800">
          {mode === 'add' ? '➕ إضافة مسافر جديد' : '✏️ تعديل بيانات المسافر'}
        </h2>

        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScanFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            disabled={scanning || saving}
            className="flex items-center justify-center gap-2 w-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            <ScanLine size={16} />
            {scanning ? 'جاري قراءة الجواز...' : 'مسح جواز السفر'}
          </button>
          {scanError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mt-2">
              <AlertCircle size={15} /> {scanError}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم بالعربية *" required>
            <input className={ic} value={data.full_name_ar ?? ''} onChange={f('full_name_ar')} />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input className={ic} value={data.full_name_en ?? ''} onChange={f('full_name_en')} dir="ltr" />
          </Field>
          <Field label="الجنس *" required>
            <select className={ic} value={data.gender ?? ''} onChange={setGender}>
              <option value="">— اختر —</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </Field>
          <Field label="رقم البطاقة الشخصية (CPR)">
            <input className={ic} value={data.cpr_number ?? ''} onChange={f('cpr_number')} dir="ltr" />
          </Field>
          <Field label="رقم الهاتف">
            <input className={ic} value={data.phone ?? ''} onChange={f('phone')} dir="ltr" />
          </Field>
          <Field label="رقم جواز السفر">
            <input className={ic} value={data.passport_number ?? ''} onChange={f('passport_number')} dir="ltr" />
          </Field>
          <Field label="تاريخ إصدار الجواز">
            <input className={ic} type="date" value={data.passport_issue_date ?? ''} onChange={f('passport_issue_date')} />
          </Field>
          <Field label="تاريخ انتهاء الجواز">
            <input className={ic} type="date" value={data.passport_expiry_date ?? ''} onChange={f('passport_expiry_date')} />
          </Field>
          <Field label="تاريخ الميلاد">
            <input className={ic} type="date" value={data.date_of_birth ?? ''} onChange={f('date_of_birth')} />
          </Field>
          <Field label="الجنسية">
            <select className={ic} value={data.nationality ?? ''} onChange={f('nationality')}>
              <option value="">— اختر —</option>
              {nationalitySelectOptions(data.nationality).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="ملاحظات">
          <textarea className={ic + ' resize-none'} rows={2} value={data.notes ?? ''} onChange={f('notes')} />
        </Field>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onSave}
            disabled={saving || !data.full_name_ar || !data.gender}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-medium">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 mr-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
