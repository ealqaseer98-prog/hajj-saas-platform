// src/pages/TripDetailPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArrowRight, Plus, Plane, Bus, Train, Car, Users, Trash2, UserPlus, UserMinus } from 'lucide-react'
import type { Trip, TripLeg, Traveller, Transport } from '../types'

const TRANSPORT_ICON: Record<Transport, React.ReactNode> = {
  plane:       <Plane size={14} />,
  bus:         <Bus size={14} />,
  train:       <Train size={14} />,
  private_car: <Car size={14} />,
}

const TRANSPORT_AR: Record<Transport, string> = {
  plane: 'طائرة', bus: 'حافلة', train: 'قطار', private_car: 'سيارة خاصة',
}

export default function TripDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [legModal, setLegModal]     = useState(false)
  const [newLeg, setNewLeg]         = useState<Partial<TripLeg>>({ transport_type: 'plane', leg_order: 1 })
  const [travellerSearch, setSearch] = useState('')
  const [showAddTraveller, setShowAddTraveller] = useState(false)

  const { data: trip } = useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      const { data } = await supabase.from('trips').select('*').eq('id', id!).single()
      return data as Trip
    },
    enabled: !!id,
  })

  const { data: legs = [] } = useQuery({
    queryKey: ['trip-legs', id],
    queryFn: async () => {
      const { data } = await supabase.from('trip_legs').select('*').eq('trip_id', id!).order('leg_order')
      return (data ?? []) as TripLeg[]
    },
    enabled: !!id,
  })

  const { data: enrolled = [] } = useQuery({
    queryKey: ['trip-travellers', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('traveller_trips')
        .select('*, traveller:travellers(id, full_name_ar, cpr_number, phone)')
        .eq('trip_id', id!)
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const { data: allTravellers = [] } = useQuery({
    queryKey: ['travellers-search', travellerSearch],
    queryFn: async () => {
      let q = supabase.from('travellers').select('id, full_name_ar, cpr_number').order('full_name_ar')
      if (travellerSearch) q = q.ilike('full_name_ar', `%${travellerSearch}%`)
      const { data } = await q.limit(10)
      return (data ?? []) as Traveller[]
    },
    enabled: showAddTraveller,
  })

  const addLeg = useMutation({
    mutationFn: (leg: Partial<TripLeg>) =>
      supabase.from('trip_legs').insert({ ...leg, trip_id: id }).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip-legs', id] }); setLegModal(false) },
  })

  const deleteLeg = useMutation({
    mutationFn: (legId: string) => supabase.from('trip_legs').delete().eq('id', legId).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip-legs', id] }),
  })

  const enrollTraveller = useMutation({
    mutationFn: (travellerId: string) =>
      supabase.from('traveller_trips').insert({ trip_id: id, traveller_id: travellerId, status: 'confirmed' }).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip-travellers', id] }); setShowAddTraveller(false) },
  })

  const unenrollTraveller = useMutation({
    mutationFn: (ttId: string) => supabase.from('traveller_trips').delete().eq('id', ttId).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip-travellers', id] }),
  })

  const enrolledIds = enrolled.map((e: any) => e.traveller_id)

  if (!trip) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <button onClick={() => navigate('/trips')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowRight size={16} /> العودة إلى الرحلات
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-800">{trip.trip_name}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          {trip.departure_date && <span>المغادرة: {trip.departure_date}</span>}
          {trip.return_date    && <span>العودة: {trip.return_date}</span>}
          <span>السعة: {enrolled.length}/{trip.max_travellers}</span>
        </div>
      </div>

      {/* Route / Legs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">مراحل الرحلة</h2>
          <button onClick={() => { setNewLeg({ transport_type: 'plane', leg_order: legs.length + 1 }); setLegModal(true) }}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg">
            <Plus size={12} /> إضافة مرحلة
          </button>
        </div>

        {legs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">لم تتم إضافة مراحل للرحلة بعد</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute right-[11px] top-4 bottom-4 w-0.5 bg-gray-200" />
            <div className="space-y-4">
              {legs.map((leg, i) => (
                <div key={leg.id} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 z-10 mt-0.5">
                    {TRANSPORT_ICON[leg.transport_type]}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-800 text-sm">
                          {leg.from_location} → {leg.to_location}
                          <span className="mr-2 text-xs text-gray-400">({TRANSPORT_AR[leg.transport_type]})</span>
                        </p>
                        {leg.flight_number && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            رقم الرحلة: {leg.flight_number}
                            {leg.airline && <span className="mr-2">{leg.airline}</span>}
                          </p>
                        )}
                        {leg.train_number && (
                          <p className="text-xs text-gray-500 mt-0.5">رقم القطار: {leg.train_number}</p>
                        )}
                        <div className="flex gap-4 text-xs text-gray-400 mt-1">
                          {leg.departure_dt && <span>المغادرة: {new Date(leg.departure_dt).toLocaleString('ar-BH')}</span>}
                          {leg.arrival_dt   && <span>الوصول: {new Date(leg.arrival_dt).toLocaleString('ar-BH')}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteLeg.mutate(leg.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Travellers */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users size={15} /> المسافرون ({enrolled.length})
          </h2>
          <button onClick={() => setShowAddTraveller(!showAddTraveller)}
            className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
            <UserPlus size={12} /> إضافة مسافر
          </button>
        </div>

        {showAddTraveller && (
          <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-2">
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="ابحث عن مسافر..."
              value={travellerSearch}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {allTravellers.filter(t => !enrolledIds.includes(t.id)).map(t => (
                <button key={t.id}
                  onClick={() => enrollTraveller.mutate(t.id)}
                  className="w-full text-right px-3 py-2 text-sm hover:bg-white rounded-lg transition-colors flex items-center justify-between">
                  <span>{t.full_name_ar}</span>
                  <span className="text-gray-400 text-xs font-mono">{t.cpr_number}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          {enrolled.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-gray-800">{e.traveller?.full_name_ar}</span>
                <span className="text-gray-400 text-xs mr-2 font-mono">{e.traveller?.cpr_number}</span>
              </div>
              <button onClick={() => unenrollTraveller.mutate(e.id)}
                className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                title="إزالة من الرحلة">
                <UserMinus size={14} />
              </button>
            </div>
          ))}
          {enrolled.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لم يتم تسجيل مسافرين في هذه الرحلة</p>}
        </div>
      </div>

      {/* Add leg modal */}
      {legModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">إضافة مرحلة رحلة</h2>
            <div className="grid grid-cols-2 gap-3">
              {([['من *','from_location'],['إلى *','to_location']] as [string,string][]).map(([label,key]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input className={ic} value={(newLeg as any)[key] ?? ''}
                    onChange={e => setNewLeg(l => ({ ...l, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">وسيلة النقل</label>
              <select className={ic} value={newLeg.transport_type ?? 'plane'}
                onChange={e => setNewLeg(l => ({ ...l, transport_type: e.target.value as Transport }))}>
                <option value="plane">طائرة</option>
                <option value="bus">حافلة</option>
                <option value="train">قطار (الحرمين)</option>
                <option value="private_car">سيارة خاصة</option>
              </select>
            </div>
            {newLeg.transport_type === 'plane' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">رقم الرحلة</label>
                  <input className={ic} dir="ltr" value={newLeg.flight_number ?? ''}
                    onChange={e => setNewLeg(l => ({ ...l, flight_number: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">شركة الطيران</label>
                  <input className={ic} value={newLeg.airline ?? ''}
                    onChange={e => setNewLeg(l => ({ ...l, airline: e.target.value }))} />
                </div>
              </div>
            )}
            {newLeg.transport_type === 'train' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">رقم القطار</label>
                <input className={ic} dir="ltr" value={newLeg.train_number ?? ''}
                  onChange={e => setNewLeg(l => ({ ...l, train_number: e.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">وقت المغادرة</label>
                <input className={ic} type="datetime-local" value={newLeg.departure_dt?.slice(0,16) ?? ''}
                  onChange={e => setNewLeg(l => ({ ...l, departure_dt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">وقت الوصول</label>
                <input className={ic} type="datetime-local" value={newLeg.arrival_dt?.slice(0,16) ?? ''}
                  onChange={e => setNewLeg(l => ({ ...l, arrival_dt: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => addLeg.mutate(newLeg)}
                disabled={addLeg.isPending || !newLeg.from_location || !newLeg.to_location}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => setLegModal(false)}
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
