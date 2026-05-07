// src/pages/TravellersPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Plus, Edit2, Trash2, Eye, UserCheck, AlertCircle } from 'lucide-react'
import type { Traveller, VisaStatus, PackageType } from '../types'

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

const TASREEH_SOURCE_LABELS: Record<'bahrain' | 'saudi', string> = {
  bahrain: 'البحرين',
  saudi: 'السعودية',
}

const GROUP_NAME_LABELS: Record<'alammar' | 'sarhan' | 'other', string> = {
  alammar: 'العمار',
  sarhan: 'السرحان',
  other: 'أخرى',
}

type TravellerColumnKey =
  | 'full_name_ar'
  | 'full_name_en'
  | 'cpr_number'
  | 'gender'
  | 'phone'
  | 'passport_number'
  | 'package_type'
  | 'group_name'
  | 'tasreeh_source'
  | 'visa_status'

const TRAVELLER_COLUMNS: { key: TravellerColumnKey; label: string }[] = [
  { key: 'full_name_ar', label: 'الاسم بالعربية' },
  { key: 'full_name_en', label: 'الاسم بالإنجليزية' },
  { key: 'cpr_number', label: 'رقم البطاقة' },
  { key: 'gender', label: 'الجنس' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'passport_number', label: 'جواز السفر' },
  { key: 'package_type', label: 'الباقة' },
  { key: 'group_name', label: 'اسم المجموعة' },
  { key: 'tasreeh_source', label: 'مصدر التصريح' },
  { key: 'visa_status', label: 'حالة التصريح' },
]

const EMPTY: Partial<Traveller> = {
  cpr_number: '', full_name_ar: '', full_name_en: '',
  phone: '', email: '', passport_number: '',
  nationality: 'بحريني', visa_status: 'pending', package_type: null, group_name: null, tasreeh_source: null, gender: null, notes: '',
}

export default function TravellersPage() {
  const qc        = useQueryClient()
  const navigate  = useNavigate()
  const [search, setSearch]           = useState('')
  const [modal, setModal]             = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected]       = useState<Partial<Traveller>>(EMPTY)
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all')
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<Record<TravellerColumnKey, boolean>>({
    full_name_ar: true,
    full_name_en: false,
    cpr_number: true,
    gender: true,
    phone: false,
    passport_number: false,
    package_type: true,
    group_name: true,
    tasreeh_source: true,
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

  const filtered = genderFilter === 'all'
    ? travellers
    : travellers.filter(t => t.gender === genderFilter)

  const maleCount   = travellers.filter(t => t.gender === 'male').length
  const femaleCount = travellers.filter(t => t.gender === 'female').length

  const save = useMutation({
    mutationFn: async (t: Partial<Traveller>) => {
      if (modal === 'add') {
        await supabase.from('travellers').insert(t).throwOnError()
      } else {
        const { id, created_at, updated_at, ...rest } = t as Traveller
        await supabase.from('travellers').update(rest).eq('id', id).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['travellers'] })
      setModal(null)
      setSelected(EMPTY)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) =>
      supabase.from('travellers').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['travellers'] }),
  })

  const openEdit = (t: Traveller) => { setSelected(t); setModal('edit') }
  const activeColumns = TRAVELLER_COLUMNS.filter(c => selectedColumns[c.key])

  const getColumnValue = (t: Traveller, key: TravellerColumnKey) => {
    if (key === 'full_name_ar') return t.full_name_ar ?? '—'
    if (key === 'full_name_en') return t.full_name_en ?? '—'
    if (key === 'cpr_number') return t.cpr_number ?? '—'
    if (key === 'gender') return t.gender === 'male' ? 'رجل' : t.gender === 'female' ? 'امرأة' : '—'
    if (key === 'phone') return t.phone ?? '—'
    if (key === 'passport_number') return t.passport_number ?? '—'
    if (key === 'package_type') return t.package_type ? PACKAGE_LABELS[t.package_type] : '—'
    if (key === 'group_name') {
      return t.group_name === 'alammar' || t.group_name === 'sarhan' || t.group_name === 'other'
        ? GROUP_NAME_LABELS[t.group_name]
        : '—'
    }
    if (key === 'tasreeh_source') {
      return t.tasreeh_source === 'bahrain' || t.tasreeh_source === 'saudi'
        ? TASREEH_SOURCE_LABELS[t.tasreeh_source]
        : '—'
    }
    if (key === 'visa_status') return VISA_LABELS[t.visa_status].label
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
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')

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
          <h1 class="title">قائمة الحجاج - حملة العمار للحج والعمرة</h1>
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
            <span className="text-blue-600 font-medium">👨 رجال: {maleCount}</span>
            <span className="text-pink-600 font-medium">🧕 نساء: {femaleCount}</span>
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
          <button
            onClick={() => { setSelected(EMPTY); setModal('add') }}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> إضافة حاج
          </button>

          {showColumnPicker && (
            <div className="absolute left-0 top-12 z-20 bg-white border border-gray-200 shadow-lg rounded-xl p-3 w-64 space-y-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">إظهار/إخفاء الأعمدة</p>
              {TRAVELLER_COLUMNS.map(col => (
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

      <div className="flex flex-col md:flex-row gap-3">
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
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-full md:w-auto">
          {(['all','male','female'] as const).map(v => (
            <button key={v} onClick={() => setGenderFilter(v)}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                genderFilter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'all' ? 'الكل' : v === 'male' ? 'رجال' : 'نساء'}
            </button>
          ))}
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
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  {activeColumns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-gray-600">
                      {col.key === 'visa_status' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VISA_LABELS[t.visa_status].className}`}>
                          {VISA_LABELS[t.visa_status].label}
                        </span>
                      ) : col.key === 'gender' ? (
                        t.gender === 'male' ? <span className="text-blue-600 text-xs font-medium">👨 رجل</span>
                        : t.gender === 'female' ? <span className="text-pink-600 text-xs font-medium">🧕 امرأة</span>
                        : <span className="text-gray-300 text-xs">—</span>
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
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"><Edit2 size={15} /></button>
                      <button onClick={() => window.confirm('هل أنت متأكد من الحذف؟') && del.mutate(t.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="md:hidden p-3 space-y-3">
            {filtered.map(t => (
              <div key={t.id} className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800">{t.full_name_ar}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VISA_LABELS[t.visa_status].className}`}>
                    {VISA_LABELS[t.visa_status].label}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-sm text-gray-600">
                  <p><span className="text-gray-500">رقم البطاقة: </span><span className="font-mono">{t.cpr_number}</span></p>
                  <p>
                    <span className="text-gray-500">الجنس: </span>
                    {t.gender === 'male' ? 'رجل' : t.gender === 'female' ? 'امرأة' : '—'}
                  </p>
                  <p>
                    <span className="text-gray-500">اسم المجموعة: </span>
                    {t.group_name === 'alammar' || t.group_name === 'sarhan' || t.group_name === 'other'
                      ? GROUP_NAME_LABELS[t.group_name]
                      : '—'}
                  </p>
                  <p>
                    <span className="text-gray-500">مصدر التصريح: </span>
                    {t.tasreeh_source === 'bahrain' || t.tasreeh_source === 'saudi'
                      ? TASREEH_SOURCE_LABELS[t.tasreeh_source]
                      : '—'}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button onClick={() => navigate(`/travellers/${t.id}`)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="عرض الملف الشخصي"><Eye size={15} /></button>
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
}

function TravellerModal({ mode, data, onChange, onSave, onClose, saving, error }: ModalProps) {
  const f = (field: keyof Traveller) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...data, [field]: e.target.value })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
        <h2 className="text-lg font-bold text-gray-800">
          {mode === 'add' ? '➕ إضافة حاج جديد' : '✏️ تعديل بيانات الحاج'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم بالعربية *" required>
            <input className={ic} value={data.full_name_ar ?? ''} onChange={f('full_name_ar')} />
          </Field>
          <Field label="الاسم بالإنجليزية *" required>
            <input className={ic} value={data.full_name_en ?? ''} onChange={f('full_name_en')} dir="ltr" />
          </Field>
          <Field label="رقم البطاقة الشخصية (CPR) *" required>
            <input className={ic} value={data.cpr_number ?? ''} onChange={f('cpr_number')} dir="ltr" />
          </Field>
          <Field label="الجنس *" required>
            <select className={ic} value={data.gender ?? ''} onChange={f('gender')}>
              <option value="">— اختر —</option>
              <option value="male">رجل</option>
              <option value="female">امرأة</option>
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
          <Field label="تاريخ انتهاء الجواز">
            <input className={ic} type="date" value={data.passport_expiry ?? ''} onChange={f('passport_expiry')} />
          </Field>
          <Field label="تاريخ الميلاد">
            <input className={ic} type="date" value={data.date_of_birth ?? ''} onChange={f('date_of_birth')} />
          </Field>
          <Field label="الجنسية">
            <input className={ic} value={data.nationality ?? ''} onChange={f('nationality')} />
          </Field>
          <Field label="اسم المجموعة">
            <select className={ic} value={data.group_name ?? ''} onChange={f('group_name')}>
              <option value="">— اختر —</option>
              <option value="alammar">العمار</option>
              <option value="sarhan">السرحان</option>
              <option value="other">أخرى</option>
            </select>
          </Field>
          <Field label="مصدر التصريح">
            <select className={ic} value={data.tasreeh_source ?? ''} onChange={f('tasreeh_source')}>
              <option value="">— اختر —</option>
              <option value="bahrain">البحرين</option>
              <option value="saudi">السعودية</option>
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
            disabled={saving || !data.cpr_number || !data.full_name_ar || !data.full_name_en}
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
