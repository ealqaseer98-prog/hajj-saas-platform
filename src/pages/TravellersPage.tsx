// src/pages/TravellersPage.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { canManageTravellers } from '../lib/permissions'
import { Search, Plus, Edit2, Trash2, Eye, UserCheck, AlertCircle, ScanLine } from 'lucide-react'
import type { Traveller, VisaStatus, PackageType, Gender } from '../types'
import { findRowByPassport, scanPassportFile, SCAN_PASSPORT_ERROR_AR, dateOrNull, type ScannedPassport } from '../lib/scanPassport'

function applyScannedToTraveller(current: Partial<Traveller>, scanned: ScannedPassport): Partial<Traveller> {
  const next = { ...current }
  if (scanned.full_name_ar) next.full_name_ar = scanned.full_name_ar
  if (scanned.full_name_en) next.full_name_en = scanned.full_name_en
  if (scanned.passport_number) next.passport_number = scanned.passport_number
  if (scanned.cpr_number) next.cpr_number = scanned.cpr_number
  if (scanned.nationality) next.nationality = scanned.nationality
  if (scanned.date_of_birth) next.date_of_birth = scanned.date_of_birth.slice(0, 10)
  if (scanned.gender === 'male' || scanned.gender === 'female') next.gender = scanned.gender
  if (scanned.passport_issue_date) next.passport_issue_date = scanned.passport_issue_date.slice(0, 10)
  if (scanned.passport_expiry_date) {
    const expiry = scanned.passport_expiry_date.slice(0, 10)
    next.passport_expiry_date = expiry
    next.passport_expiry = expiry
  }
  return next
}

const VISA_LABELS: Record<VisaStatus, { label: string; className: string }> = {
  pending:  { label: 'في الانتظار', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'موافق عليه',  className: 'bg-green-100 text-green-800'  },
  rejected: { label: 'مرفوض',       className: 'bg-red-100 text-red-800'       },
}

const PACKAGE_LABELS: Record<PackageType, string> = {
  barr: 'البر',
  tayaran_dammam: 'طيران - الدمام',
  tayaran_bahrain: 'طيران - البحرين',
  tasreeh_only: 'فقط تصريح',
}

function visaStatusCfg(status: string | null | undefined) {
  return VISA_LABELS[status as VisaStatus] ?? { className: '', label: status ?? '—' }
}

function packageLabel(type: string | null | undefined) {
  return type ? (PACKAGE_LABELS[type as PackageType] ?? type) : '—'
}

function genderCfg(gender: string | null | undefined) {
  if (gender === 'male' || gender === 'ذكر') return { label: 'ذكر', className: 'bg-blue-50 text-blue-700' }
  if (gender === 'female' || gender === 'أنثى') return { label: 'أنثى', className: 'bg-pink-50 text-pink-700' }
  return { label: '—', className: 'text-gray-400' }
}

function normalizeGender(gender: string | null | undefined): Gender | null {
  if (gender === 'male' || gender === 'ذكر') return 'male'
  if (gender === 'female' || gender === 'أنثى') return 'female'
  return null
}

function buildSavePayload(t: Partial<Traveller>) {
  return {
    cpr_number: t.cpr_number,
    permit_number: t.permit_number ?? null,
    full_name_ar: t.full_name_ar,
    full_name_en: t.full_name_en ?? '',
    group_name: t.group_name ?? null,
    tasreeh_source: 'bahrain' as const,
    package_type: t.package_type ?? null,
    gender: normalizeGender(t.gender),
    phone: t.phone ?? null,
    email: t.email ?? null,
    passport_number: t.passport_number ?? null,
    passport_issue_date: dateOrNull(t.passport_issue_date),
    passport_expiry_date: dateOrNull(t.passport_expiry_date ?? t.passport_expiry),
    passport_expiry: dateOrNull(t.passport_expiry_date ?? t.passport_expiry),
    nationality: t.nationality ?? 'بحريني',
    date_of_birth: dateOrNull(t.date_of_birth),
    visa_status: t.visa_status ?? 'pending',
    notes: t.notes ?? null,
  }
}

type TravellerColumnKey =
  | 'full_name_ar'
  | 'full_name_en'
  | 'cpr_number'
  | 'gender'
  | 'phone'
  | 'passport_number'
  | 'package_type'
  | 'visa_status'

const TRAVELLER_COLUMNS: { key: TravellerColumnKey; label: string }[] = [
  { key: 'full_name_ar', label: 'الاسم بالعربية' },
  { key: 'gender', label: 'الجنس' },
  { key: 'full_name_en', label: 'الاسم بالإنجليزية' },
  { key: 'cpr_number', label: 'رقم البطاقة' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'passport_number', label: 'جواز السفر' },
  { key: 'package_type', label: 'الباقة' },
  { key: 'visa_status', label: 'حالة التصريح' },
]

const EMPTY: Partial<Traveller> = {
  cpr_number: '', full_name_ar: '', full_name_en: '',
  phone: '', email: '', passport_number: '',
  nationality: 'بحريني', visa_status: 'pending', package_type: null, group_name: null, tasreeh_source: 'bahrain', gender: null, notes: '',
}

export default function TravellersPage() {
  const qc        = useQueryClient()
  const navigate  = useNavigate()
  const canEdit   = canManageTravellers(useAuthStore(s => s.user?.role))
  const [search, setSearch]           = useState('')
  const [modal, setModal]             = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected]       = useState<Partial<Traveller>>(EMPTY)
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all')
  const [packageFilter, setPackageFilter] = useState<'all' | PackageType>('all')
  const [visaFilter, setVisaFilter] = useState<'all' | VisaStatus>('all')
  const [sortBy, setSortBy] = useState<'name' | 'cpr' | 'gender' | 'package'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<Record<TravellerColumnKey, boolean>>({
    full_name_ar: true,
    full_name_en: false,
    cpr_number: true,
    gender: true,
    phone: false,
    passport_number: false,
    package_type: true,
    visa_status: true,
  })

  const { data: travellers = [], isLoading } = useQuery({
    queryKey: ['travellers', search],
    queryFn: async () => {
      let q = supabase.from('travellers').select('*').order('full_name_ar')
      if (search.trim()) {
        q = q.or(
          `full_name_ar.ilike.%${search}%,full_name_en.ilike.%${search}%,cpr_number.ilike.%${search}%,passport_number.ilike.%${search}%`
        )
      }
      const { data } = await q
      return (data ?? []) as Traveller[]
    },
  })

  const filtered = travellers
    .filter(t => (genderFilter === 'all' ? true : t.gender === genderFilter))
    .filter(t => (packageFilter === 'all' ? true : t.package_type === packageFilter))
    .filter(t => (visaFilter === 'all' ? true : t.visa_status === visaFilter))
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      if (sortBy === 'name') return (a.full_name_ar ?? '').localeCompare(b.full_name_ar ?? '', 'ar') * dir
      if (sortBy === 'cpr') return (a.cpr_number ?? '').localeCompare(b.cpr_number ?? '', 'en') * dir
      if (sortBy === 'gender') {
        const gv = (g: Traveller['gender']) => (g === 'male' ? 1 : g === 'female' ? 2 : 3)
        return (gv(a.gender) - gv(b.gender)) * dir
      }
      const pl = (p: Traveller['package_type']) => packageLabel(p)
      return pl(a.package_type).localeCompare(pl(b.package_type), 'ar') * dir
    })

  const hasActiveFilters =
    genderFilter !== 'all' ||
    packageFilter !== 'all' ||
    visaFilter !== 'all' ||
    sortBy !== 'name' ||
    sortDirection !== 'asc'

  const maleCount   = travellers.filter(t => t.gender === 'male').length
  const femaleCount = travellers.filter(t => t.gender === 'female').length

  const save = useMutation({
    mutationFn: async (t: Partial<Traveller>) => {
      const payload = buildSavePayload(t)
      if (modal === 'add') {
        await supabase.from('travellers').insert(payload).throwOnError()
      } else {
        const { id } = t as Traveller
        await supabase.from('travellers').update(payload).eq('id', id).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travellers'] })
      setModal(null)
      setSelected(EMPTY)
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('travellers').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['travellers'] }),
  })

  const openEdit = (t: Traveller) => {
    setSelected({
      ...t,
      gender: normalizeGender(t.gender),
    })
    setModal('edit')
  }
  const activeColumns = TRAVELLER_COLUMNS.filter(
    c => c.key === 'gender' || selectedColumns[c.key]
  )

  const getColumnValue = (t: Traveller, key: TravellerColumnKey) => {
    if (key === 'full_name_ar') return t.full_name_ar ?? '—'
    if (key === 'full_name_en') return t.full_name_en ?? '—'
    if (key === 'cpr_number') return t.cpr_number ?? '—'
    if (key === 'gender') return genderCfg(t.gender).label
    if (key === 'phone') return t.phone ?? '—'
    if (key === 'passport_number') return t.passport_number ?? '—'
    if (key === 'package_type') return packageLabel(t.package_type)
    if (key === 'visa_status') return visaStatusCfg(t.visa_status).label
    return '—'
  }

  const printTravellers = () => {
    if (activeColumns.length === 0) {
      window.alert('يرجى اختيار عمود واحد على الأقل للطباعة.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) {
      window.alert('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.')
      return
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const tableHead = activeColumns
      .map(c => `<th>${escapeHtml(c.label)}</th>`)
      .join('')

    const tableBody = filtered
      .map(t => {
        const cells = activeColumns
          .map(c => `<td>${escapeHtml(getColumnValue(t, c.key))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    const today = new Date().toLocaleDateString('ar-BH')
    const html = `
      <!doctype html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>قائمة الحجاج</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
          body { font-family: "Noto Naskh Arabic", serif; direction: rtl; }
          .print-wrap { padding: 8px; }
          .title { font-size: 24px; font-weight: 700; margin: 0 0 6px 0; }
          .date { margin: 0 0 14px 0; font-size: 14px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          tr:nth-child(even) td { background: #f9fafb; }
          @media print {
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body * { visibility: hidden; }
            .print-wrap, .print-wrap * { visibility: visible; }
            .print-wrap { position: absolute; inset: 0; }
          }
        </style>
      </head>
      <body>
        <div class="print-wrap">
          <h1 class="title">قائمة الحجاج</h1>
          <p class="date">التاريخ: ${escapeHtml(today)}</p>
          <table>
            <thead><tr>${tableHead}</tr></thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>
        <script>
          window.onload = function () {
            window.print();
            setTimeout(function () { window.close(); }, 150);
          };
        </script>
      </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الحجاج</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>الإجمالي: {travellers.length}</span>
            <span className="text-blue-600 font-medium">👨 ذكور: {maleCount}</span>
            <span className="text-pink-600 font-medium">🧕 إناث: {femaleCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setShowColumnPicker(v => !v)}
            className="border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            تخصيص الأعمدة
          </button>
          <button
            onClick={printTravellers}
            className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            تصدير PDF
          </button>
          {canEdit && (
            <button
              onClick={() => { setSelected(EMPTY); setModal('add') }}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} /> إضافة حاج
            </button>
          )}

          {showColumnPicker && (
            <div className="absolute left-0 top-12 z-20 bg-white border border-gray-200 shadow-lg rounded-xl p-3 w-64 space-y-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">إظهار/إخفاء الأعمدة</p>
              {TRAVELLER_COLUMNS.filter(col => col.key !== 'gender').map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedColumns[col.key]}
                    onChange={e => setSelectedColumns(s => ({ ...s, [col.key]: e.target.checked }))}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="ابحث بالاسم أو رقم البطاقة أو جواز السفر..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={genderFilter} onChange={e => setGenderFilter(e.target.value as 'all' | 'male' | 'female')}>
            <option value="all">الجنس: الكل</option>
            <option value="male">الجنس: ذكور</option>
            <option value="female">الجنس: إناث</option>
          </select>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={packageFilter} onChange={e => setPackageFilter(e.target.value as 'all' | PackageType)}>
            <option value="all">الباقة: الكل</option>
            <option value="barr">الباقة: البر</option>
            <option value="tayaran_dammam">الباقة: طيران - الدمام</option>
            <option value="tayaran_bahrain">الباقة: طيران - البحرين</option>
            <option value="tasreeh_only">الباقة: فقط تصريح</option>
          </select>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={visaFilter} onChange={e => setVisaFilter(e.target.value as 'all' | VisaStatus)}>
            <option value="all">حالة التصريح: الكل</option>
            <option value="pending">حالة التصريح: في الانتظار</option>
            <option value="approved">حالة التصريح: موافق عليه</option>
            <option value="rejected">حالة التصريح: مرفوض</option>
          </select>
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'cpr' | 'gender' | 'package')}>
            <option value="name">الفرز: الاسم</option>
            <option value="cpr">الفرز: رقم البطاقة</option>
            <option value="gender">الفرز: الجنس</option>
            <option value="package">الفرز: الباقة</option>
          </select>
          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {sortDirection === 'asc' ? 'تصاعدي' : 'تنازلي'}
          </button>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setGenderFilter('all')
                setPackageFilter('all')
                setVisaFilter('all')
                setSortBy('name')
                setSortDirection('asc')
              }}
              className="border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-red-50"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <UserCheck size={40} className="mx-auto mb-3 opacity-30" />
            لا يوجد حاجون
          </div>
        ) : (
          <>
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {activeColumns.map(col => (
                  <th key={col.key} className="text-right px-4 py-3 font-medium text-gray-600">{col.label}</th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => {
                const visaCfg = visaStatusCfg(t.visa_status)
                const genderBadge = genderCfg(t.gender)
                return (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  {activeColumns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-gray-600">
                      {col.key === 'visa_status' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${visaCfg.className}`}>
                          {visaCfg.label}
                        </span>
                      ) : col.key === 'gender' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${genderBadge.className}`}>
                          {genderBadge.label}
                        </span>
                      ) : (
                        <span className={col.key === 'cpr_number' || col.key === 'phone' || col.key === 'passport_number' ? 'font-mono' : ''}>
                          {getColumnValue(t, col.key)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => navigate(`/travellers/${t.id}`)}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="عرض الملف الشخصي"><Eye size={15} /></button>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(t)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="تعديل"><Edit2 size={15} /></button>
                          <button onClick={() => window.confirm('هل أنت متأكد من الحذف؟') && del.mutate(t.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف"><Trash2 size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          <div className="md:hidden p-3 space-y-3">
            {filtered.map(t => {
              const visaCfg = visaStatusCfg(t.visa_status)
              return (
              <div key={t.id} className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800">{t.full_name_ar}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${visaCfg.className}`}>
                    {visaCfg.label}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-sm text-gray-600">
                  <p><span className="text-gray-500">رقم البطاقة: </span><span className="font-mono">{t.cpr_number}</span></p>
                  <p>
                    <span className="text-gray-500">الجنس: </span>
                    {genderCfg(t.gender).label}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button onClick={() => navigate(`/travellers/${t.id}`)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="عرض الملف الشخصي"><Eye size={15} /></button>
                  {canEdit && (
                    <>
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"><Edit2 size={15} /></button>
                      <button onClick={() => window.confirm('هل أنت متأكد من الحذف؟') && del.mutate(t.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"><Trash2 size={15} /></button>
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      {canEdit && modal && (
        <TravellerModal
          mode={modal} data={selected} onChange={setSelected}
          onSave={() => save.mutate(selected)}
          onClose={() => { setModal(null); setSelected(EMPTY) }}
          saving={save.isPending} error={save.error?.message}
          onScanned={async scanned => {
            const existing = scanned.passport_number
              ? await findRowByPassport<Traveller>('travellers', scanned.passport_number, selected.id)
              : null
            if (existing) {
              const updateExisting = window.confirm(
                'يوجد حاج مسجّل بنفس رقم الجواز. هل تريد تحديث بياناته بدلاً من إضافة حاج جديد؟'
              )
              if (updateExisting) {
                setModal('edit')
                setSelected(applyScannedToTraveller({ ...existing, gender: normalizeGender(existing.gender) }, scanned))
                return
              }
            }
            setSelected(s => applyScannedToTraveller(s, scanned))
          }}
        />
      )}
    </div>
  )
}

interface ModalProps {
  mode: 'add' | 'edit'; data: Partial<Traveller>
  onChange: (t: Partial<Traveller>) => void
  onSave: () => void; onClose: () => void
  saving: boolean; error?: string
  onScanned: (fields: ScannedPassport) => Promise<void>
}

function TravellerModal({ mode, data, onChange, onSave, onClose, saving, error, onScanned }: ModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const f = (field: keyof Traveller) =>
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
      await onScanned(await scanPassportFile(file))
    } catch {
      setScanError(SCAN_PASSPORT_ERROR_AR)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
        <h2 className="text-lg font-bold text-gray-800">
          {mode === 'add' ? '➕ إضافة حاج جديد' : '✏️ تعديل بيانات الحاج'}
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
          <Field label="رقم البطاقة الشخصية (CPR) *" required>
            <input className={ic} value={data.cpr_number ?? ''} onChange={f('cpr_number')} dir="ltr" />
          </Field>
          <Field label="رقم التصريح">
            <input className={ic} value={data.permit_number ?? ''} onChange={f('permit_number')} dir="ltr" />
          </Field>
          <Field label="الجنس *" required>
            <select className={ic} value={data.gender ?? ''} onChange={setGender}>
              <option value="">— اختر —</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </Field>
          <Field label="رقم الهاتف">
            <input className={ic} value={data.phone ?? ''} onChange={f('phone')} dir="ltr" />
          </Field>
          <Field label="البريد الإلكتروني">
            <input className={ic} type="email" value={data.email ?? ''} onChange={f('email')} dir="ltr" />
          </Field>
          <Field label="رقم جواز السفر">
            <input className={ic} value={data.passport_number ?? ''} onChange={f('passport_number')} dir="ltr" />
          </Field>
          <Field label="تاريخ إصدار الجواز">
            <input className={ic} type="date" value={data.passport_issue_date ?? ''} onChange={f('passport_issue_date')} />
          </Field>
          <Field label="تاريخ انتهاء الجواز">
            <input className={ic} type="date" value={data.passport_expiry_date ?? data.passport_expiry ?? ''} onChange={f('passport_expiry_date')} />
          </Field>
          <Field label="تاريخ الميلاد">
            <input className={ic} type="date" value={data.date_of_birth ?? ''} onChange={f('date_of_birth')} />
          </Field>
          <Field label="الجنسية">
            <input className={ic} value={data.nationality ?? ''} onChange={f('nationality')} />
          </Field>
          <Field label="الباقة">
            <select className={ic} value={data.package_type ?? ''} onChange={f('package_type')}>
              <option value="">— اختر —</option>
              <option value="barr">البر</option>
              <option value="tayaran_dammam">طيران - الدمام</option>
              <option value="tayaran_bahrain">طيران - البحرين</option>
            </select>
          </Field>
          <Field label="حالة التصريح">
            <select className={ic} value={data.visa_status ?? 'pending'} onChange={f('visa_status')}>
              <option value="pending">في الانتظار</option>
              <option value="approved">موافق عليه</option>
              <option value="rejected">مرفوض</option>
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
            disabled={saving || !data.cpr_number || !data.full_name_ar || !data.gender}
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
