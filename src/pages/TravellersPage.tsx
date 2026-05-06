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

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">المسافرون</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>الإجمالي: {travellers.length}</span>
            <span className="text-blue-600 font-medium">👨 ذكور: {maleCount}</span>
            <span className="text-pink-600 font-medium">👩 إناث: {femaleCount}</span>
          </div>
        </div>
        <button
          onClick={() => { setSelected(EMPTY); setModal('add') }}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> إضافة مسافر
        </button>
      </div>

      <div className="flex gap-3">
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
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all','male','female'] as const).map(v => (
            <button key={v} onClick={() => setGenderFilter(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                genderFilter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'all' ? 'الكل' : v === 'male' ? 'ذكور' : 'إناث'}
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
            لا يوجد مسافرون
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الاسم بالعربية</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الاسم بالإنجليزية</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">رقم البطاقة</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الجنس</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الباقة</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">التصريح</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{t.full_name_ar}</td>
                  <td className="px-4 py-3 text-gray-600">{t.full_name_en}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{t.cpr_number}</td>
                  <td className="px-4 py-3">
                    {t.gender === 'male'   ? <span className="text-blue-600 text-xs font-medium">👨 ذكر</span>
                   : t.gender === 'female' ? <span className="text-pink-600 text-xs font-medium">👩 أنثى</span>
                   : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.package_type ? PACKAGE_LABELS[t.package_type] : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VISA_LABELS[t.visa_status].className}`}>
                      {VISA_LABELS[t.visa_status].label}
                    </span>
                  </td>
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
          {mode === 'add' ? '➕ إضافة مسافر جديد' : '✏️ تعديل بيانات المسافر'}
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
