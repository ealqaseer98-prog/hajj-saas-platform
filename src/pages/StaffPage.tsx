// src/pages/StaffPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, UserCheck, UserX } from 'lucide-react'

type StaffGender = 'male' | 'female' | ''

type StaffForm = {
  full_name_ar: string
  full_name_en: string
  role_title: string
  phone: string
  gender: StaffGender
  notes: string
}

const EMPTY_FORM: StaffForm = {
  full_name_ar: '',
  full_name_en: '',
  role_title: '',
  phone: '',
  gender: '',
  notes: '',
}

const fieldClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function genderLabel(gender: string | null | undefined) {
  if (gender === 'male') return 'ذكر'
  if (gender === 'female') return 'أنثى'
  return '—'
}

export default function StaffPage() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('full_name_ar')
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (row: any) => {
    setEditingId(row.id)
    setForm({
      full_name_ar: row.full_name_ar ?? '',
      full_name_en: row.full_name_en ?? '',
      role_title: row.role_title ?? '',
      phone: row.phone ?? '',
      gender: row.gender === 'male' || row.gender === 'female' ? row.gender : '',
      notes: row.notes ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  const saveStaff = useMutation({
    mutationFn: async () => {
      if (!form.full_name_ar.trim()) throw new Error('name')
      if (!form.role_title.trim()) throw new Error('role')

      const payload = {
        full_name_ar: form.full_name_ar.trim(),
        full_name_en: form.full_name_en.trim() || null,
        role_title: form.role_title.trim(),
        phone: form.phone.trim() || null,
        gender: form.gender || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await supabase.from('staff').update(payload).eq('id', editingId).throwOnError()
      } else {
        await supabase.from('staff').insert({ ...payload, is_active: true }).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      closeModal()
    },
    onError: (err: Error) => {
      if (err.message === 'name') setFormError('الاسم بالعربية مطلوب')
      else if (err.message === 'role') setFormError('المسمى الوظيفي مطلوب')
      else setFormError('تعذّر الحفظ، يرجى المحاولة مجددًا')
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await supabase
        .from('staff')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('staff').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })

  const activeCount = staffList.filter((s: any) => s.is_active).length

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الكادر</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            إدارة أعضاء الكادر — نشط: {activeCount} من {staffList.length}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> إضافة عضو
        </button>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
      ) : staffList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          لا يوجد أعضاء في الكادر
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الاسم</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">المسمى</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الهاتف</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الجنس</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">الحالة</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((row: any) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-50 last:border-0 ${
                      row.is_active ? '' : 'bg-gray-50/80 opacity-75'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{row.full_name_ar}</p>
                      {row.full_name_en && (
                        <p className="text-xs text-gray-400 mt-0.5" dir="ltr">
                          {row.full_name_en}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{row.role_title}</td>
                    <td className="py-3 px-4 font-mono text-gray-600 text-xs" dir="ltr">
                      {row.phone ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{genderLabel(row.gender)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {row.is_active ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
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
                          title={row.is_active ? 'تعطيل' : 'تفعيل'}
                          onClick={() =>
                            toggleActive.mutate({ id: row.id, is_active: !row.is_active })
                          }
                          disabled={toggleActive.isPending}
                          className={`p-2 rounded-lg ${
                            row.is_active
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {row.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
                        <button
                          type="button"
                          title="حذف"
                          onClick={() => {
                            if (window.confirm(`حذف ${row.full_name_ar} من الكادر؟`)) {
                              deleteStaff.mutate(row.id)
                            }
                          }}
                          disabled={deleteStaff.isPending}
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
              {editingId ? 'تعديل عضو الكادر' : 'إضافة عضو للكادر'}
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الاسم بالعربية *</label>
              <input
                className={fieldClass}
                value={form.full_name_ar}
                onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الاسم بالإنجليزية</label>
              <input
                className={fieldClass}
                dir="ltr"
                value={form.full_name_en}
                onChange={e => setForm(f => ({ ...f, full_name_en: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">المسمى الوظيفي *</label>
              <input
                className={fieldClass}
                value={form.role_title}
                onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))}
                placeholder="مثال: منسق، سائق، إداري..."
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
              <label className="block text-xs font-medium text-gray-600 mb-1">الجنس</label>
              <select
                className={fieldClass}
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value as StaffGender }))}
              >
                <option value="">—</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <textarea
                className={`${fieldClass} resize-none`}
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
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
                onClick={() => saveStaff.mutate()}
                disabled={saveStaff.isPending}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {saveStaff.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
