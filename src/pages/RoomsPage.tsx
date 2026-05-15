// src/pages/RoomsPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArrowRight, Plus, UserPlus, Trash2, AlertTriangle, BedDouble, Printer } from 'lucide-react'
import type { Room, RoomAssignment, Traveller, RoomType } from '../types'
import { ROOM_TYPE_AR, ROOM_TYPE_CAPACITY } from '../lib/roomTypes'

export default function RoomsPage() {
  const { hotelId } = useParams<{ hotelId: string }>()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [addRoomModal, setAddRoomModal] = useState(false)
  const [assignModal, setAssignModal]   = useState<string | null>(null) // room id
  const [newRoom, setNewRoom]           = useState<Partial<Room>>({ room_type: 'quad', capacity: 4 })
  const [selectedTraveller, setSelectedTraveller] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [noRoomListModal, setNoRoomListModal] = useState(false)

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

  /** Travellers with no room assignment in any hotel (only used when this hotel has no trip) */
  const { data: travellersNoRoomAnywhere = [] } = useQuery({
    queryKey: ['travellers-no-room-globally'],
    queryFn: async () => {
      const [{ data: allTravellers, error: e1 }, { data: assignedRows, error: e2 }] = await Promise.all([
        supabase.from('travellers').select('id, full_name_ar, cpr_number').order('full_name_ar'),
        supabase.from('room_assignments').select('traveller_id'),
      ])
      if (e1) throw e1
      if (e2) throw e2
      const assigned = new Set((assignedRows ?? []).map((r: { traveller_id: string }) => r.traveller_id))
      return ((allTravellers ?? []) as Traveller[]).filter(t => !assigned.has(t.id))
    },
    enabled: !!hotel && !hotel.trip_id,
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
      setAssignSearch('')
      qc.invalidateQueries({ queryKey: ['travellers-no-room-globally'] })
    },
  })

  const removeAssignment = useMutation({
    mutationFn: (id: string) => supabase.from('room_assignments').delete().eq('id', id).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', hotelId] })
      qc.invalidateQueries({ queryKey: ['travellers-no-room-globally'] })
    },
  })

  const deleteRoom = useMutation({
    mutationFn: (id: string) => supabase.from('rooms').delete().eq('id', id).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms', hotelId] })
      qc.invalidateQueries({ queryKey: ['room-counts'] })
      qc.invalidateQueries({ queryKey: ['travellers-no-room-globally'] })
    },
  })

  // Travellers not yet assigned to any room in this hotel
  const assignedIds = rooms.flatMap((r: any) => (r.assignments ?? []).map((a: any) => a.traveller_id))
  const unassigned  = travellers.filter(t => !assignedIds.includes(t.id))
  const travellersWithoutRoomList: Traveller[] = hotel?.trip_id
    ? unassigned
    : travellersNoRoomAnywhere
  const withoutRoomCount = travellersWithoutRoomList.length
  const assignSearchTerm = assignSearch.trim().toLowerCase()
  const matchingAssignable = assignSearchTerm
    ? unassigned.filter((t: Traveller) =>
        (t.full_name_ar ?? '').toLowerCase().includes(assignSearchTerm))
    : []

  const escHtml = (s: string | undefined | null) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const printRoomsReport = () => {
    if (!hotel) return
    const title = `توزيع الغرف - ${hotel.hotel_name ?? ''} - ${hotel.city ?? ''}`
    const totalRooms = rooms.length
    const totalAssigned = rooms.reduce((s: number, r: any) => s + (r.assignments?.length ?? 0), 0)
    const roomBlocks = rooms
      .map((room: any) => {
        const typeAr = ROOM_TYPE_AR[room.room_type as RoomType] ?? room.room_type
        const floorLine = room.floor
          ? `<span class="meta">الطابق ${escHtml(room.floor)}</span>`
          : ''
        const occ =
          (room.assignments ?? []).length > 0
            ? (room.assignments as any[])
                .map(
                  (a: any) => `
              <div class="occ">
                <span class="name">${escHtml(a.traveller?.full_name_ar)}</span>
                <span class="cpr">${escHtml(a.traveller?.cpr_number ?? '—')}</span>
              </div>`
                )
                .join('')
            : '<div class="occ empty">لا يوجد حاجون</div>'
        return `
          <section class="room-block">
            <header class="room-head">
              <strong>غرفة ${escHtml(room.room_number)}</strong>
              <span class="meta">${escHtml(typeAr)}</span>
              ${floorLine}
            </header>
            <div class="occ-list">${occ}</div>
          </section>`
      })
      .join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>${escHtml(title)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body { margin: 20px; direction: rtl; font-family: 'Noto Naskh Arabic', Arial, sans-serif; color: #1a1a1a; }
          .logo-wrap { text-align: center; margin-bottom: 12px; }
          .logo { height: 72px; width: auto; object-fit: contain; }
          h1 { font-size: 1.25rem; text-align: center; margin: 0 0 16px; font-weight: 700; border-bottom: 2px solid #111; padding-bottom: 10px; }
          .room-block { margin-bottom: 18px; page-break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
          .room-head { background: #f5f5f5; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 14px; }
          .room-head .meta { color: #555; font-weight: 400; }
          .occ-list { padding: 8px 12px 10px; }
          .occ { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
          .occ:last-child { border-bottom: none; }
          .occ .name { font-weight: 600; }
          .occ .cpr { font-family: ui-monospace, monospace; color: #444; direction: ltr; text-align: left; }
          .occ.empty { color: #999; font-style: italic; justify-content: flex-start; border: none; }
          .summary { margin-top: 22px; padding: 12px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 14px; }
          .summary p { margin: 4px 0; }
          @media print { body { margin: 8mm; } .logo { height: 64px; } }
        </style>
      </head>
      <body>
        <div class="logo-wrap">
          <img class="logo" crossorigin="anonymous" src="https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png" alt="" />
        </div>
        <h1>${escHtml(title)}</h1>
        ${roomBlocks || '<p class="occ empty">لا توجد غرف</p>'}
        <div class="summary">
          <p><strong>إجمالي الغرف:</strong> ${totalRooms}</p>
          <p><strong>إجمالي الحجاج المعيّنين:</strong> ${totalAssigned}</p>
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {withoutRoomCount > 0 && (
            <div className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded-lg">
              <AlertTriangle size={12} />
              {withoutRoomCount} حاج بدون غرفة
            </div>
          )}
          <button
            type="button"
            onClick={() => setNoRoomListModal(true)}
            disabled={!hotel}
            className="relative flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            بدون غرفة
            {withoutRoomCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">
                {withoutRoomCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={printRoomsReport}
            disabled={!hotel}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Printer size={15} /> طباعة PDF
          </button>
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
          { label: 'الحجاج المعيّنون', value: assignedIds.length },
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
          const occupancy = (room.assignments ?? []).length
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
                {(room.assignments ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 text-sm">
                    <span className="text-gray-700">{a.traveller?.full_name_ar}</span>
                    <button onClick={() => removeAssignment.mutate(a.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {isEmpty && <p className="text-xs text-gray-300 italic">لا يوجد حاجون</p>}
              </div>

              {/* Capacity bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, (occupancy / room.capacity) * 100)}%` }} />
              </div>

              <div className="flex gap-2">
                {!isFull && (
                  <button
                    type="button"
                    onClick={() => {
                      setAssignModal(room.id)
                      setSelectedTraveller('')
                      setAssignSearch('')
                    }}
                    className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors flex-1 justify-center">
                    <UserPlus size={12} /> إضافة حاج
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
                onChange={e => {
                  const room_type = e.target.value as RoomType
                  setNewRoom(r => ({ ...r, room_type, capacity: ROOM_TYPE_CAPACITY[room_type] }))
                }}>
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
            <h2 className="text-lg font-bold">إضافة حاج للغرفة</h2>
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">الحاج</label>
              <input
                type="text"
                className={ic}
                value={assignSearch}
                placeholder="ابحث باسم الحاج..."
                onChange={e => {
                  setAssignSearch(e.target.value)
                  setSelectedTraveller('')
                }}
                autoComplete="off"
              />
              {assignSearch.trim() && matchingAssignable.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {matchingAssignable.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTraveller(t.id)
                        setAssignSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`)
                      }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      {t.full_name_ar}{' '}
                      <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                    </button>
                  ))}
                </div>
              )}
              {assignSearch.trim() && matchingAssignable.length === 0 && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">لا توجد نتائج مطابقة</p>
              )}
              {!assignSearch.trim() && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">ابدأ بكتابة اسم الحاج للبحث والاختيار</p>
              )}
            </div>
            {unassigned.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                {hotel?.trip_id
                  ? 'جميع الحجاج المرتبطين بهذه الرحلة قد تم تعيينهم لغرف هذا الفندق'
                  : 'لا يوجد حجاج غير معيّنين في غرف هذا الفندق'}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => selectedTraveller && assignTraveller.mutate({ roomId: assignModal, travellerId: selectedTraveller })}
                disabled={assignTraveller.isPending || !selectedTraveller}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                تعيين
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssignModal(null)
                  setAssignSearch('')
                  setSelectedTraveller('')
                }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Travellers without a room (trip scope or all travellers with no assignment anywhere) */}
      {noRoomListModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-room-modal-title"
          onClick={e => {
            if (e.target === e.currentTarget) setNoRoomListModal(false)
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl"
            dir="rtl"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 id="no-room-modal-title" className="text-lg font-bold text-gray-800">
                بدون غرفة
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {hotel?.trip_id
                  ? 'حجاج رحلة هذا الفندق غير المعيّنين في غرف هذا الفندق'
                  : 'جميع الحجاج الذين ليس لديهم تعيين غرفة في أي فندق'}
              </p>
              <p className="mt-2 text-sm font-medium text-emerald-700">العدد: {withoutRoomCount}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {travellersWithoutRoomList.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">لا يوجد حجاج بدون غرفة</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {travellersWithoutRoomList.map(t => (
                    <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                      <span className="font-medium text-gray-800">{t.full_name_ar}</span>
                      <span className="font-mono text-xs text-gray-600 tabular-nums" dir="ltr">
                        {t.cpr_number ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setNoRoomListModal(false)}
                className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
