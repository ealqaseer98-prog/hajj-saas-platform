// src/pages/RoomsPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArrowRight, Plus, UserPlus, Trash2, AlertTriangle, BedDouble } from 'lucide-react'
import type { Room, RoomAssignment, Traveller, RoomType } from '../types'

const ROOM_TYPE_AR: Record<RoomType, string> = {
  single: 'مفردة', double: 'مزدوجة', triple: 'ثلاثية', quad: 'رباعية', quint: 'خماسية',
}

export default function RoomsPage() {
  const { hotelId } = useParams<{ hotelId: string }>()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [addRoomModal, setAddRoomModal] = useState(false)
  const [assignModal, setAssignModal]   = useState<string | null>(null) // room id
  const [newRoom, setNewRoom]           = useState<Partial<Room>>({ room_type: 'quad', capacity: 4 })
  const [selectedTraveller, setSelectedTraveller] = useState('')

  // Hotel info
  const { data: hotel } = useQuery({
    queryKey: ['hotel', hotelId],
    queryFn: async () => {
      const { data } = await supabase.from('hotels').select('*, trip:trips(trip_name)').eq('id', hotelId!).single()
      return data as any
    },
    enabled: !!hotelId,
  })

  // Rooms with assignments
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', hotelId],
    queryFn: async () => {
      const { data } = await supabase
        .from('rooms')
        .select('*, assignments:room_assignments(*, traveller:travellers(id, full_name_ar, cpr_number))')
        .eq('hotel_id', hotelId!)
        .order('room_number')
      return (data ?? []) as any[]
    },
    enabled: !!hotelId,
  })

  // Travellers for dropdown (those in hotel's trip)
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers-for-assignment', hotel?.trip_id],
    queryFn: async () => {
      if (!hotel?.trip_id) {
        const { data } = await supabase.from('travellers').select('id, full_name_ar, cpr_number').order('full_name_ar')
        return (data ?? []) as Traveller[]
      }
      const { data } = await supabase
        .from('traveller_trips')
        .select('traveller:travellers(id, full_name_ar, cpr_number)')
        .eq('trip_id', hotel.trip_id)
        .eq('status', 'confirmed')
      return ((data ?? []).map((r: any) => r.traveller).filter(Boolean)) as Traveller[]
    },
    enabled: !!hotel,
  })

  const createRoom = useMutation({
    mutationFn: (r: Partial<Room>) =>
      supabase.from('rooms').insert({ ...r, hotel_id: hotelId }).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', hotelId] })
      qc.invalidateQueries({ queryKey: ['room-counts'] })
      setAddRoomModal(false)
      setNewRoom({ room_type: 'quad', capacity: 4 })
    },
  })

  const assignTraveller = useMutation({
    mutationFn: ({ roomId, travellerId }: { roomId: string; travellerId: string }) =>
      supabase.from('room_assignments').insert({ room_id: roomId, traveller_id: travellerId }).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', hotelId] })
      setAssignModal(null)
      setSelectedTraveller('')
    },
  })

  const removeAssignment = useMutation({
    mutationFn: (id: string) => supabase.from('room_assignments').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms', hotelId] }),
  })

  const deleteRoom = useMutation({
    mutationFn: (id: string) => supabase.from('rooms').delete().eq('id', id).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', hotelId] })
      qc.invalidateQueries({ queryKey: ['room-counts'] })
    },
  })

  // Travellers not yet assigned to any room in this hotel
  const assignedIds = rooms.flatMap((r: any) => r.assignments.map((a: any) => a.traveller_id))
  const unassigned  = travellers.filter(t => !assignedIds.includes(t.id))

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <button onClick={() => navigate('/hotels')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowRight size={16} /> العودة إلى الفنادق
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{hotel?.hotel_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{hotel?.city}</p>
          {hotel?.trip?.trip_name && (
            <p className="text-xs text-emerald-600 mt-0.5">رحلة: {hotel.trip.trip_name}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {unassigned.length > 0 && (
            <div className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded-lg">
              <AlertTriangle size={12} />
              {unassigned.length} مسافر بدون غرفة
            </div>
          )}
          <button onClick={() => setAddRoomModal(true)}
            className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> إضافة غرفة
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'عدد الغرف', value: rooms.length },
          { label: 'المسافرون المعيّنون', value: assignedIds.length },
          { label: 'الإشغال', value: rooms.length ? `${Math.round((assignedIds.length / rooms.reduce((s: number, r: any) => s + r.capacity, 0)) * 100)}%` : '—' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room: any) => {
          const occupancy = room.assignments.length
          const isFull    = occupancy >= room.capacity
          const isEmpty   = occupancy === 0

          return (
            <div key={room.id}
              className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${isFull ? 'border-red-200' : isEmpty ? 'border-gray-100' : 'border-green-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BedDouble size={16} className="text-gray-400" />
                  <span className="font-bold text-gray-800">غرفة {room.room_number}</span>
                  {room.floor && <span className="text-xs text-gray-400">الطابق {room.floor}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {ROOM_TYPE_AR[room.room_type as RoomType]}
                  </span>
                  <span className={`text-xs font-medium ${isFull ? 'text-red-600' : 'text-emerald-600'}`}>
                    {occupancy}/{room.capacity}
                  </span>
                </div>
              </div>

              {/* Occupants */}
              <div className="space-y-1.5 min-h-[40px]">
                {room.assignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 text-sm">
                    <span className="text-gray-700">{a.traveller?.full_name_ar}</span>
                    <button onClick={() => removeAssignment.mutate(a.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {isEmpty && <p className="text-xs text-gray-300 italic">لا يوجد مسافرون</p>}
              </div>

              {/* Capacity bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, (occupancy / room.capacity) * 100)}%` }} />
              </div>

              <div className="flex gap-2">
                {!isFull && (
                  <button onClick={() => { setAssignModal(room.id); setSelectedTraveller('') }}
                    className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors flex-1 justify-center">
                    <UserPlus size={12} /> إضافة مسافر
                  </button>
                )}
                <button onClick={() => window.confirm('حذف الغرفة؟') && deleteRoom.mutate(room.id)}
                  className="text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {rooms.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          لم يتم إضافة غرف بعد
        </div>
      )}

      {/* Add room modal */}
      {addRoomModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">إضافة غرفة جديدة</h2>
            {[
              ['رقم الغرفة *', 'room_number', 'text'],
              ['الطابق',      'floor',       'text'],
              ['السعة',        'capacity',    'number'],
            ].map(([label, key, type]) => (
              <div key={key as string}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input className={ic} type={type} value={(newRoom as any)[key] ?? ''}
                  onChange={e => setNewRoom(r => ({ ...r, [key as string]: type === 'number' ? +e.target.value : e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نوع الغرفة</label>
              <select className={ic} value={newRoom.room_type ?? 'quad'}
                onChange={e => setNewRoom(r => ({ ...r, room_type: e.target.value as RoomType }))}>
                {Object.entries(ROOM_TYPE_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => createRoom.mutate(newRoom)} disabled={createRoom.isPending || !newRoom.room_number}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => setAddRoomModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign traveller modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">إضافة مسافر للغرفة</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">اختر المسافر</label>
              <select className={ic} value={selectedTraveller} onChange={e => setSelectedTraveller(e.target.value)}>
                <option value="">— اختر مسافرًا —</option>
                {travellers.filter(t => !assignedIds.includes(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.full_name_ar}</option>
                ))}
              </select>
            </div>
            {unassigned.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                جميع المسافرين المرتبطين بهذه الرحلة قد تم تعيينهم لغرف
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => selectedTraveller && assignTraveller.mutate({ roomId: assignModal, travellerId: selectedTraveller })}
                disabled={assignTraveller.isPending || !selectedTraveller}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                تعيين
              </button>
              <button onClick={() => setAssignModal(null)}
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
