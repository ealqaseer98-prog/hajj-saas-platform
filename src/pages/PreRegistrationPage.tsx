// src/pages/PreRegistrationPage.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Search, FileDown, ScanLine } from 'lucide-react'
import type { PreRegistration, HajjType, AdminReferral } from '../types'
import { scanPassportFile, SCAN_PASSPORT_ERROR_AR } from '../lib/scanPassport'

type PreRegForm = {
  full_name_ar: string
  cpr_number: string
  phone: string
  hajj_type: HajjType | ''
  used_bahrain_permit: boolean
  reference_name: string
  admin_referral: AdminReferral | ''
}

const EMPTY_FORM: PreRegForm = {
  full_name_ar: '',
  cpr_number: '',
  phone: '',
  hajj_type: '',
  used_bahrain_permit: false,
  reference_name: '',
  admin_referral: '',
}

const HAJJ_TYPE_OPTIONS: { value: HajjType; label: string }[] = [
  { value: 'sarura', label: 'صرورة' },
  { value: 'mustahab', label: 'مستحب' },
]

const ADMIN_REFERRAL_OPTIONS: AdminReferral[] = ['مصطفى', 'علي', 'عادل', 'الياس']

const fieldClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function hajjTypeLabel(type: HajjType | string | null | undefined) {
  if (type === 'sarura') return 'صرورة'
  if (type === 'mustahab') return 'مستحب'
  return '—'
}

function permitLabel(used: boolean | null | undefined) {
  if (used === true) return 'نعم'
  if (used === false) return 'لا'
  return '—'
}

export default function PreRegistrationPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PreRegForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const scanFileRef = useRef<HTMLInputElement>(null)

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['pre-registrations', search],
    queryFn: async () => {
      let q = supabase.from('pre_registrations').select('*').order('full_name_ar')
      if (search.trim()) {
        q = q.or(
          `full_name_ar.ilike.%${search.trim()}%,cpr_number.ilike.%${search.trim()}%`
        )
      }
      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      return (data ?? []) as PreRegistration[]
    },
  })

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setScanError('')
    setModalOpen(true)
  }

  const openEdit = (row: PreRegistration) => {
    setEditingId(row.id)
    setForm({
      full_name_ar: row.full_name_ar ?? '',
      cpr_number: row.cpr_number ?? '',
      phone: row.phone ?? '',
      hajj_type: row.hajj_type ?? '',
      used_bahrain_permit: row.used_bahrain_permit ?? false,
      reference_name: row.reference_name ?? '',
      admin_referral: row.admin_referral ?? '',
    })
    setFormError('')
    setScanError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setScanError('')
  }

  const handleScanPassport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanError('')
    setScanning(true)
    try {
      const scanned = await scanPassportFile(file)
      setForm(f => ({
        ...f,
        ...(scanned.full_name_ar ? { full_name_ar: scanned.full_name_ar } : {}),
        ...(scanned.cpr_number ? { cpr_number: scanned.cpr_number } : {}),
      }))
    } catch {
      setScanError(SCAN_PASSPORT_ERROR_AR)
    } finally {
      setScanning(false)
    }
  }

  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!form.full_name_ar.trim()) throw new Error('name')
      if (!form.cpr_number.trim()) throw new Error('cpr')
      if (!form.hajj_type) throw new Error('hajj_type')
      if (!form.admin_referral) throw new Error('admin_referral')

      const payload = {
        full_name_ar: form.full_name_ar.trim(),
        cpr_number: form.cpr_number.trim(),
        phone: form.phone.trim() || null,
        hajj_type: form.hajj_type,
        used_bahrain_permit: form.used_bahrain_permit,
        reference_name: form.reference_name.trim() || null,
        admin_referral: form.admin_referral,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await supabase.from('pre_registrations').update(payload).eq('id', editingId).throwOnError()
      } else {
        await supabase.from('pre_registrations').insert(payload).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-registrations'] })
      closeModal()
    },
    onError: (err: Error) => {
      if (err.message === 'name') setFormError('الاسم بالعربية مطلوب')
      else if (err.message === 'cpr') setFormError('رقم البطاقة مطلوب')
      else if (err.message === 'hajj_type') setFormError('نوع الحج مطلوب')
      else if (err.message === 'admin_referral') setFormError('الإداري المسؤول مطلوب')
      else setFormError('تعذّر الحفظ، يرجى المحاولة مجددًا')
    },
  })

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('pre_registrations').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pre-registrations'] }),
  })

  const printList = () => {
    if (entries.length === 0) {
      window.alert('لا توجد سجلات للتصدير.')
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

    const columns = [
      { label: 'الاسم', value: (r: PreRegistration) => r.full_name_ar },
      { label: 'رقم البطاقة', value: (r: PreRegistration) => r.cpr_number },
      { label: 'الهاتف', value: (r: PreRegistration) => r.phone ?? '—' },
      { label: 'النوع', value: (r: PreRegistration) => hajjTypeLabel(r.hajj_type) },
      { label: 'تصريح البحرين', value: (r: PreRegistration) => permitLabel(r.used_bahrain_permit) },
      { label: 'المرجع', value: (r: PreRegistration) => r.reference_name ?? '—' },
      { label: 'الإداري المسؤول', value: (r: PreRegistration) => r.admin_referral },
    ]

    const tableHead = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')
    const tableBody = entries
      .map(row => {
        const cells = columns
          .map(c => `<td>${escapeHtml(c.value(row))}</td>`)
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
        <title>قائمة التسجيل المسبق</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
          body { font-family: "Noto Naskh Arabic", serif; direction: rtl; }
          .print-wrap { padding: 8px; }
          .title { font-size: 24px; font-weight: 700; margin: 0 0 6px 0; }
          .meta { margin: 0 0 14px 0; font-size: 14px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          tr:nth-child(even) td { background: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="print-wrap">
          <h1 class="title">قائمة التسجيل المسبق</h1>
          <p class="meta">التاريخ: ${escapeHtml(today)} — العدد الإجمالي: ${entries.length}</p>
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

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const tableMissing =
    error instanceof Error &&
    (error.message.includes('pre_registrations') ||
      error.message.includes('relation') ||
      error.message.includes('schema cache'))

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">التسجيل المسبق</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            العدد الإجمالي: {entries.length}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={printList}
            className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <FileDown size={15} /> تصدير PDF
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={15} /> إضافة تسجيل
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="ابحث بالاسم أو رقم البطاقة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
      </div>

      {tableMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          جدول التسجيل المسبق غير موجود في قاعدة البيانات. يرجى تشغيل ملف{' '}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">supabase_migration_pre_registration.sql</code>{' '}
          في محرر SQL في Supabase.
        </div>
      )}

      {isLoading ? (
        <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          لا توجد سجلات تسجيل مسبق
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الاسم</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">رقم البطاقة</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الهاتف</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">النوع</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">تصريح البحرين</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المرجع</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الإداري المسؤول</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 px-4 font-medium text-gray-800">{row.full_name_ar}</td>
                    <td className="py-3 px-4 font-mono text-gray-600 text-xs" dir="ltr">
                      {row.cpr_number}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-600 text-xs" dir="ltr">
                      {row.phone ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{hajjTypeLabel(row.hajj_type)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.used_bahrain_permit
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {permitLabel(row.used_bahrain_permit)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{row.reference_name ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-700">{row.admin_referral}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          title="تعديل"
                          onClick={() => openEdit(row)}
                          className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          title="حذف"
                          onClick={() => {
                            if (window.confirm(`حذف تسجيل ${row.full_name_ar}؟`)) {
                              deleteEntry.mutate(row.id)
                            }
                          }}
                          disabled={deleteEntry.isPending}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2">
              {editingId ? 'تعديل تسجيل مسبق' : 'إضافة تسجيل مسبق'}
            </h2>

            <div>
              <input ref={scanFileRef} type="file" accept="image/*" className="hidden" onChange={handleScanPassport} />
              <button type="button" onClick={() => scanFileRef.current?.click()}
                disabled={scanning || saveEntry.isPending}
                className="flex items-center justify-center gap-2 w-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                <ScanLine size={16} />
                {scanning ? 'جاري قراءة الجواز...' : 'مسح جواز السفر'}
              </button>
              {scanError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">
                  {scanError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الاسم بالعربية *</label>
              <input
                className={fieldClass}
                value={form.full_name_ar}
                onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم البطاقة *</label>
              <input
                className={fieldClass}
                dir="ltr"
                value={form.cpr_number}
                onChange={e => setForm(f => ({ ...f, cpr_number: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم الهاتف</label>
              <input
                className={fieldClass}
                dir="ltr"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نوع الحج *</label>
              <select
                className={fieldClass}
                value={form.hajj_type}
                onChange={e => setForm(f => ({ ...f, hajj_type: e.target.value as HajjType | '' }))}
              >
                <option value="">— اختر —</option>
                {HAJJ_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                هل استهلك تصريح البحرين خلال 5 سنوات؟
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, used_bahrain_permit: true }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.used_bahrain_permit
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  نعم
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, used_bahrain_permit: false }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    !form.used_bahrain_permit
                      ? 'bg-green-100 border-green-300 text-green-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  لا
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">اسم المرجع</label>
              <input
                className={fieldClass}
                value={form.reference_name}
                onChange={e => setForm(f => ({ ...f, reference_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الإداري المسؤول *</label>
              <select
                className={fieldClass}
                value={form.admin_referral}
                onChange={e => setForm(f => ({ ...f, admin_referral: e.target.value as AdminReferral | '' }))}
              >
                <option value="">— اختر —</option>
                {ADMIN_REFERRAL_OPTIONS.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => saveEntry.mutate()}
                disabled={saveEntry.isPending}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {saveEntry.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
