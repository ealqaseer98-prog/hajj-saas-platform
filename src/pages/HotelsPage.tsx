// src/pages/HotelsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, BedDouble, MapPin, Edit2, Trash2 } from 'lucide-react'
import type { Hotel, Trip } from '../types'

export default function HotelsPage() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState<Partial<Hotel>>({})
  const [filterTrip, setFilterTrip] = useState('')

  const { data: hotels = [] } = useQuery({
    queryKey: ['hotels', filterTrip],
    queryFn: async () => {
      let q = supabase.from('hotels').select('*, trip:trips(trip_name)').order('city')
      if (filterTrip) q = q.eq('trip_id', filterTrip)
      const { data } = await q
      return (data ?? []) as any[]
    },
  })

  const { data: trips = [] } = useQuery({
    queryKey: ['trips-list'],
    queryFn: async () => {
      const { data } = await supabase.from('trips').select('id, trip_name').order('departure_date', { ascending: false })
      return (data ?? []) as Trip[]
    },
  })

  // Room counts per hotel
  const { data: roomCounts = {} } = useQuery({
    queryKey: ['room-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('rooms').select('hotel_id, id')
      const c: Record<string, number> = {}
      ;(data ?? []).forEach((r: any) => { c[r.hotel_id] = (c[r.hotel_id] ?? 0) + 1 })
      return c
    },
  })

  const save = useMutation({
    mutationFn: (h: Partial<Hotel>) => supabase.from('hotels').insert(h).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotels'] }); setModal(false) },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('hotels').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  })

  const meccaHotels  = hotels.filter((h: any) => h.city?.includes('مكة'))
  const medinaHotels = hotels.filter((h: any) => h.city?.includes('المدينة'))
  const otherHotels  = hotels.filter((h: any) => !h.city?.includes('مكة') && !h.city?.includes('المدينة'))

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">الفنادق وتوزيع الغرف</h1>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <select
            className="w-full md:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={filterTrip}
            onChange={e => setFilterTrip(e.target.value)}
          >
            <option value="">كل الرحلات</option>
            {trips.map(t => <option key={t.id} value={t.id}>{t.trip_name}</option>)}
          </select>
          <button onClick={() => { setSel({}); setModal(true) }}
            className="flex items-center justify-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium w-full md:w-auto">
            <Plus size={15} /> إضافة فندق
          </button>
        </div>
      </div>

      {[
        { label: '🕋 فنادق مكة المكرمة',    hotels: meccaHotels  },
        { label: '🟢 فنادق المدينة المنورة', hotels: medinaHotels },
        { label: '📍 فنادق أخرى',            hotels: otherHotels  },
      ].map(section => section.hotels.length > 0 && (
        <div key={section.label}>
          <h2 className="text-sm font-semibold text-gray-600 mb-3">{section.label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {section.hotels.map((h: any) => (
              <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800">{h.hotel_name}</h3>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <MapPin size={12} /> {h.city}
                      {h.trip?.trip_name && <span className="mr-2 text-emerald-600">· {h.trip.trip_name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => navigate(`/hotels/${h.id}/rooms`)}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
                    >
                      <BedDouble size={12} />
                      {roomCounts[h.id] ?? 0} غرفة
                    </button>
                    <button onClick={() => window.confirm('حذف الفندق؟') && del.mutate(h.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {(h.check_in_date || h.check_out_date) && (
                  <div className="text-xs text-gray-500">
                    تسجيل الدخول: {h.check_in_date ?? '—'} &nbsp;·&nbsp; تسجيل الخروج: {h.check_out_date ?? '—'}
                  </div>
                )}

                {h.address && <p className="text-xs text-gray-400">{h.address}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {hotels.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          لا توجد فنادق مسجلة
        </div>
      )}

      {/* Add hotel modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-center md:p-4 z-50">
          <div className="bg-white w-full h-full rounded-none p-6 space-y-3 overflow-y-auto md:h-auto md:max-w-md md:rounded-2xl md:shadow-2xl" dir="rtl">
            <h2 className="text-lg font-bold">إضافة فندق</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['اسم الفندق *', 'hotel_name', 'text'],
                ['المدينة *',    'city',        'text'],
              ].map(([label, key, type]) => (
                <div key={key as string}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input className={ic} type={type} value={(sel as any)[key] ?? ''}
                    onChange={e => setSel(s => ({ ...s, [key as string]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الرحلة</label>
              <select className={ic} value={sel.trip_id ?? ''}
                onChange={e => setSel(s => ({ ...s, trip_id: e.target.value }))}>
                <option value="">— بدون رحلة —</option>
                {trips.map(t => <option key={t.id} value={t.id}>{t.trip_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[['تاريخ تسجيل الدخول','check_in_date'],['تاريخ تسجيل الخروج','check_out_date']].map(([label,key]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input className={ic} type="date" value={(sel as any)[key] ?? ''}
                    onChange={e => setSel(s => ({ ...s, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">العنوان</label>
              <input className={ic} value={sel.address ?? ''}
                onChange={e => setSel(s => ({ ...s, address: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => save.mutate(sel)} disabled={save.isPending || !sel.hotel_name || !sel.city}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => setModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
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
