// src/pages/UmrahTripsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import type { UmrahTrip, UmrahTripStatus } from '../types'

const STATUS_MAP: Record<UmrahTripStatus, { label: string; cls: string }> = {
  upcoming:  { label: 'قادمة',  cls: 'bg-blue-100 text-blue-800'   },
  active:    { label: 'جارية',  cls: 'bg-green-100 text-green-800' },
  completed: { label: 'منتهية', cls: 'bg-gray-100 text-gray-600'   },
  cancelled: { label: 'ملغاة',  cls: 'bg-red-100 text-red-800'     },
}

const EMPTY_TRIP: Partial<UmrahTrip> = {
  trip_name: '', status: 'upcoming', max_travellers: 50,
}

export default function UmrahTripsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Partial<UmrahTrip>>(EMPTY_TRIP)

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['umrah-trips'],
    queryFn: async () => {
      const { data } = await supabase.from('umrah_trips').select('*').order('departure_date', { ascending: false })
      return (data ?? []) as UmrahTrip[]
    },
  })

  const save = useMutation({
    mutationFn: async (t: Partial<UmrahTrip>) => {
      if (modal === 'add') {
        await supabase.from('umrah_trips').insert(t).throwOnError()
      } else {
        const { id, created_at, ...rest } = t as UmrahTrip
        await supabase.from('umrah_trips').update(rest).eq('id', id).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-trips'] })
      setModal(null)
      setSelected(EMPTY_TRIP)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_trips').delete().eq('id', id).throwOnError(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['umrah-trips'] }),
  })

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">رحلات العمرة</h1>
        <button
          onClick={() => { setSelected(EMPTY_TRIP); setModal('add') }}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> إضافة رحلة
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">جارٍ التحميل...</div>
      ) : (
        <div className="grid gap-4">
          {trips.map(trip => (
            <div
              key={trip.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/umrah/trips/${trip.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-800">{trip.trip_name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[trip.status].cls}`}>
                      {STATUS_MAP[trip.status].label}
                    </span>
                    {trip.umrah_year && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs">
                        {trip.umrah_year}
                      </span>
                    )}
                  </div>
                  {trip.departure_date && (
                    <p className="text-sm text-gray-500">
                      من {trip.departure_date} إلى {trip.return_date ?? '—'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {trip.max_travellers != null && (
                    <span className="text-sm text-gray-500">الحد الأقصى: {trip.max_travellers}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setSelected(trip); setModal('edit') }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); window.confirm('حذف الرحلة؟') && del.mutate(trip.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">{modal === 'add' ? 'إضافة رحلة عمرة جديدة' : 'تعديل الرحلة'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">اسم الرحلة *</label>
                <input className={ic} value={selected.trip_name ?? ''}
                  onChange={e => setSelected(s => ({ ...s, trip_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">السنة</label>
                  <input className={ic} value={selected.umrah_year ?? ''}
                    onChange={e => setSelected(s => ({ ...s, umrah_year: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الحالة</label>
                  <select className={ic} value={selected.status}
                    onChange={e => setSelected(s => ({ ...s, status: e.target.value as UmrahTripStatus }))}>
                    <option value="upcoming">قادمة</option>
                    <option value="active">جارية</option>
                    <option value="completed">منتهية</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ المغادرة</label>
                  <input className={ic} type="date" value={selected.departure_date ?? ''}
                    onChange={e => setSelected(s => ({ ...s, departure_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ العودة</label>
                  <input className={ic} type="date" value={selected.return_date ?? ''}
                    onChange={e => setSelected(s => ({ ...s, return_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الحد الأقصى للمعتمرين</label>
                  <input className={ic} type="number" value={selected.max_travellers ?? 50}
                    onChange={e => setSelected(s => ({ ...s, max_travellers: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                <textarea className={ic + ' resize-none'} rows={2} value={selected.notes ?? ''}
                  onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => save.mutate(selected)}
                disabled={save.isPending || !selected.trip_name}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                حفظ
              </button>
              <button
                onClick={() => { setModal(null); setSelected(EMPTY_TRIP) }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
