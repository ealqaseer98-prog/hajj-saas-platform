// src/pages/BusAssignmentPage.tsx
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Bus, Printer, Shuffle, GripVertical, Plus, X, Trash2 } from 'lucide-react'

const DEFAULT_HOTEL_NAME = 'نزل إبداء اصداف'
const DEFAULT_BUS_CAPACITY = 45
const LOGO_URL =
  'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'

type BusRow = {
  id: string
  bus_number: number
  bus_name: string | null
  capacity: number
  hotel_name: string
}

type AssignmentRow = {
  id: string
  bus_id: string
  traveller_id: string | null
  display_name: string | null
  room_number: string | null
  is_manual: boolean
  sort_order: number
  traveller?: { full_name_ar: string } | null
}

type RoomGroupMember = {
  traveller_id: string
  full_name_ar: string
  room_number: string
  room_id: string
}

function displayName(a: AssignmentRow): string {
  return a.traveller?.full_name_ar ?? a.display_name ?? '—'
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Place room groups on buses; keep each room together; balance load. */
function planDistribution(
  groups: { room_id: string; members: RoomGroupMember[] }[],
  buses: BusRow[]
): { bus_id: string; traveller_id: string; display_name: string; room_number: string; sort_order: number }[] {
  const counts = new Map(buses.map(b => [b.id, 0]))
  const planned: {
    bus_id: string
    traveller_id: string
    display_name: string
    room_number: string
    sort_order: number
  }[] = []

  const sortedGroups = [...groups].sort((a, b) => b.members.length - a.members.length)

  for (const group of sortedGroups) {
    const size = group.members.length
    const pickBus = () => {
      const withSpace = buses.filter(b => (counts.get(b.id) ?? 0) + size <= b.capacity)
      const pool = withSpace.length > 0 ? withSpace : buses
      return pool.reduce((best, b) => {
        const c = counts.get(b.id) ?? 0
        const bestC = counts.get(best.id) ?? 0
        return c < bestC ? b : best
      }, pool[0])
    }
    const bus = pickBus()
    if (!bus) continue
    let order = counts.get(bus.id) ?? 0
    for (const m of group.members) {
      planned.push({
        bus_id: bus.id,
        traveller_id: m.traveller_id,
        display_name: m.full_name_ar,
        room_number: m.room_number,
        sort_order: order++,
      })
    }
    counts.set(bus.id, order)
  }
  return planned
}

async function fetchHotelRoomGroups(hotelName: string): Promise<{ room_id: string; members: RoomGroupMember[] }[]> {
  const { data: hotels } = await supabase.from('hotels').select('id').eq('hotel_name', hotelName)
  const hotelIds = (hotels ?? []).map((h: { id: string }) => h.id)
  if (hotelIds.length === 0) return []

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, room_number')
    .in('hotel_id', hotelIds)
  const roomIds = (rooms ?? []).map((r: { id: string }) => r.id)
  if (roomIds.length === 0) return []

  const roomNumById = Object.fromEntries(
    (rooms ?? []).map((r: { id: string; room_number: string }) => [r.id, r.room_number])
  )

  const { data: assignments, error } = await supabase
    .from('room_assignments')
    .select('room_id, traveller_id, traveller:travellers(id, full_name_ar)')
    .in('room_id', roomIds)

  if (error) throw error

  const byRoom: Record<string, RoomGroupMember[]> = {}
  for (const row of assignments ?? []) {
    const rid = (row as any).room_id as string
    const t = (row as any).traveller
    if (!t?.id) continue
    if (!byRoom[rid]) byRoom[rid] = []
    byRoom[rid].push({
      room_id: rid,
      traveller_id: t.id,
      full_name_ar: t.full_name_ar,
      room_number: roomNumById[rid] ?? '—',
    })
  }

  return Object.entries(byRoom).map(([room_id, members]) => ({ room_id, members }))
}

export default function BusAssignmentPage() {
  const qc = useQueryClient()
  const [hotelName, setHotelName] = useState(DEFAULT_HOTEL_NAME)
  const [activeBusNum, setActiveBusNum] = useState(1)
  const [manualNameByBus, setManualNameByBus] = useState<Record<string, string>>({})
  const [dragAssignmentId, setDragAssignmentId] = useState<string | null>(null)

  const { data: hotelNames = [] } = useQuery({
    queryKey: ['hotel-names-list'],
    queryFn: async () => {
      const { data } = await supabase.from('hotels').select('hotel_name').order('hotel_name')
      const names = [...new Set((data ?? []).map((h: { hotel_name: string }) => h.hotel_name))]
      if (!names.includes(DEFAULT_HOTEL_NAME)) names.unshift(DEFAULT_HOTEL_NAME)
      return names
    },
  })

  const { data: busData, isLoading } = useQuery({
    queryKey: ['bus-assignment-data', hotelName],
    queryFn: async () => {
      const { data: buses, error: busErr } = await supabase
        .from('buses')
        .select('*')
        .eq('hotel_name', hotelName)
        .order('bus_number')
      if (busErr) throw busErr

      const busList = (buses ?? []) as BusRow[]
      if (busList.length === 0) {
        return { buses: [] as BusRow[], assignments: [] as AssignmentRow[] }
      }

      const busIds = busList.map(b => b.id)
      const { data: assignments, error: aErr } = await supabase
        .from('bus_assignments')
        .select('*, traveller:travellers(full_name_ar)')
        .in('bus_id', busIds)
        .order('sort_order')
      if (aErr) throw aErr

      return {
        buses: busList,
        assignments: (assignments ?? []) as AssignmentRow[],
      }
    },
  })

  const buses = busData?.buses ?? []
  const assignments = busData?.assignments ?? []

  useEffect(() => {
    if (buses.length === 0) return
    if (!buses.some(b => b.bus_number === activeBusNum)) {
      setActiveBusNum(buses[0].bus_number)
    }
  }, [hotelName, buses, activeBusNum])

  const assignmentsByBus = useMemo(() => {
    const map: Record<string, AssignmentRow[]> = {}
    for (const b of buses) map[b.id] = []
    for (const a of assignments) {
      if (map[a.bus_id]) map[a.bus_id].push(a)
      else map[a.bus_id] = [a]
    }
    for (const id of Object.keys(map)) {
      map[id].sort((x, y) => x.sort_order - y.sort_order)
    }
    return map
  }, [buses, assignments])

  const activeBus = buses.find(b => b.bus_number === activeBusNum) ?? buses[0]

  const addBus = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from('buses')
        .select('bus_number')
        .eq('hotel_name', hotelName)
        .order('bus_number', { ascending: false })
        .limit(1)

      const nextNum =
        existing?.length && existing[0]?.bus_number != null
          ? (existing[0] as { bus_number: number }).bus_number + 1
          : 1

      const { error } = await supabase.from('buses').insert({
        bus_number: nextNum,
        bus_name: `باص ${nextNum}`,
        capacity: DEFAULT_BUS_CAPACITY,
        hotel_name: hotelName,
      })
      if (error) throw error
      return nextNum
    },
    onSuccess: nextNum => {
      qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] })
      if (nextNum != null) setActiveBusNum(nextNum)
    },
  })

  const deleteBus = useMutation({
    mutationFn: async (busId: string) => {
      const { count, error: countErr } = await supabase
        .from('bus_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('bus_id', busId)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) {
        throw new Error('لا يمكن حذف باص فيه ركاب. انقلهم أو احذف التعيينات أولاً.')
      }
      const { error } = await supabase.from('buses').delete().eq('id', busId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const updateBusCapacity = useMutation({
    mutationFn: async ({ busId, capacity }: { busId: string; capacity: number }) => {
      const cap = Math.max(1, capacity)
      const { error } = await supabase
        .from('buses')
        .update({ capacity: cap, updated_at: new Date().toISOString() })
        .eq('id', busId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const autoDistribute = useMutation({
    mutationFn: async () => {
      const { data: refreshed, error: busErr } = await supabase
        .from('buses')
        .select('*')
        .eq('hotel_name', hotelName)
        .order('bus_number')
      if (busErr) throw busErr
      const busList = (refreshed ?? []) as BusRow[]
      if (busList.length === 0) throw new Error('أضف باصاً واحداً على الأقل قبل التوزيع')

      const groups = await fetchHotelRoomGroups(hotelName)
      if (groups.length === 0) throw new Error('لا يوجد حجاج مسكنون في هذا الفندق')

      const busIds = busList.map(b => b.id)
      await supabase
        .from('bus_assignments')
        .delete()
        .in('bus_id', busIds)
        .eq('is_manual', false)

      const planned = planDistribution(groups, busList)
      if (planned.length === 0) return

      const { error } = await supabase.from('bus_assignments').insert(
        planned.map(p => ({
          bus_id: p.bus_id,
          traveller_id: p.traveller_id,
          display_name: p.display_name,
          room_number: p.room_number,
          is_manual: false,
          sort_order: p.sort_order,
        }))
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const moveAssignment = useMutation({
    mutationFn: async ({ assignmentId, targetBusId }: { assignmentId: string; targetBusId: string }) => {
      const list = assignmentsByBus[targetBusId] ?? []
      const { error } = await supabase
        .from('bus_assignments')
        .update({ bus_id: targetBusId, sort_order: list.length })
        .eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const addManual = useMutation({
    mutationFn: async ({ busId, name }: { busId: string; name: string }) => {
      const list = assignmentsByBus[busId] ?? []
      const { error } = await supabase.from('bus_assignments').insert({
        bus_id: busId,
        traveller_id: null,
        display_name: name.trim(),
        room_number: null,
        is_manual: true,
        sort_order: list.length,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bus_assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bus-assignment-data', hotelName] }),
  })

  const printBusList = () => {
    if (buses.length === 0) return
    const date = new Date().toLocaleDateString('ar-BH')
    const sections = buses
      .map(bus => {
        const list = assignmentsByBus[bus.id] ?? []
        const rows =
          list.length === 0
            ? '<tr><td colspan="3" style="text-align:center;color:#888">لا يوجد ركاب</td></tr>'
            : list
                .map(
                  (a, i) => `<tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(displayName(a))}</td>
              <td>${escapeHtml(a.room_number ?? '—')}</td>
            </tr>`
                )
                .join('')
        return `
        <section class="bus-page">
          <div class="logo-wrap"><img class="logo" src="${LOGO_URL}" alt="logo" crossorigin="anonymous" /></div>
          <div class="header">
            <h1>حملة العمار للحج والعمرة</h1>
            <h2>قائمة ركاب ${escapeHtml(bus.bus_name ?? `باص ${bus.bus_number}`)}</h2>
            <p class="sub">${escapeHtml(hotelName)} — ${date}</p>
          </div>
          <p class="meta">السعة: <strong>${bus.capacity}</strong> — العدد: <strong>${list.length}</strong></p>
          <table>
            <thead><tr><th>#</th><th>الاسم</th><th>رقم الغرفة</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`
      })
      .join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>توزيع الباصات — ${escapeHtml(hotelName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
    body { margin: 12px; direction: rtl; font-size: 13px; }
    .logo-wrap { text-align: center; margin-bottom: 8px; }
    .logo { height: 72px; object-fit: contain; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 12px; }
    h1 { font-size: 18px; margin: 0; }
    h2 { font-size: 15px; margin: 6px 0; color: #333; }
    .sub { font-size: 12px; color: #666; margin: 0; }
    .meta { margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: right; }
    th { background: #f0f0f0; }
    .bus-page { page-break-after: always; }
    .bus-page:last-child { page-break-after: auto; }
    @media print { body { margin: 5mm; } }
  </style>
</head>
<body>${sections}
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1200); }</script>
</body></html>`)
    win.document.close()
  }

  const handleDrop = (targetBusId: string) => {
    if (!dragAssignmentId) return
    const a = assignments.find(x => x.id === dragAssignmentId)
    if (!a || a.bus_id === targetBusId) {
      setDragAssignmentId(null)
      return
    }
    moveAssignment.mutate({ assignmentId: dragAssignmentId, targetBusId })
    setDragAssignmentId(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bus className="text-emerald-700" size={26} />
            توزيع الباصات
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">توزيع الحجاج حسب الغرف مع إبقاء زملاء الغرفة في نفس الباص</p>
        </div>
        <button
          type="button"
          onClick={printBusList}
          disabled={buses.length === 0}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Printer size={16} />
          طباعة القائمة
        </button>
      </div>

      {/* Header controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">الفندق</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={hotelName}
            onChange={e => {
              setHotelName(e.target.value)
              setActiveBusNum(1)
            }}
          >
            {hotelNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {!hotelNames.includes(hotelName) && <option value={hotelName}>{hotelName}</option>}
          </select>
        </div>
        <button
          type="button"
          onClick={() => addBus.mutate()}
          disabled={addBus.isPending}
          className="flex items-center justify-center gap-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Plus size={16} />
          {addBus.isPending ? 'جارٍ الإضافة...' : 'إضافة باص جديد'}
        </button>
        <button
          type="button"
          onClick={() => autoDistribute.mutate()}
          disabled={autoDistribute.isPending || buses.length === 0}
          className="flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Shuffle size={16} />
          {autoDistribute.isPending ? 'جارٍ التوزيع...' : 'توزيع تلقائي'}
        </button>
      </div>

      {(autoDistribute.isError || addBus.isError || deleteBus.isError) && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {(autoDistribute.error as Error)?.message ||
            (addBus.error as Error)?.message ||
            (deleteBus.error as Error)?.message ||
            'حدث خطأ. تأكد من تطبيق migration الجداول في Supabase.'}
        </p>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">جارٍ التحميل...</div>
      ) : buses.length === 0 ? (
        <div className="text-center text-gray-500 py-12 bg-white rounded-xl border border-dashed border-gray-200 space-y-4">
          <p>لا توجد باصات لهذا الفندق. أضف باصاً للبدء.</p>
          <button
            type="button"
            onClick={() => addBus.mutate()}
            disabled={addBus.isPending}
            className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Plus size={16} />
            إضافة باص جديد
          </button>
        </div>
      ) : (
        <>
          {/* Bus tabs */}
          <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
            {buses.map(bus => {
              const count = (assignmentsByBus[bus.id] ?? []).length
              const over = count > bus.capacity
              return (
                <button
                  key={bus.id}
                  type="button"
                  onClick={() => setActiveBusNum(bus.bus_number)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeBusNum === bus.bus_number
                      ? 'bg-white shadow-sm text-emerald-700'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <span className="font-bold">{bus.bus_number}</span>
                  <span className="text-gray-500 font-normal mr-0.5">باص</span>
                  <span className={`text-xs ${over ? 'text-red-600' : 'text-gray-400'}`}>
                    ({count}/{bus.capacity})
                  </span>
                </button>
              )
            })}
          </div>

          {/* Desktop: all columns; mobile: active tab only */}
          <div className="hidden lg:grid gap-4" style={{ gridTemplateColumns: `repeat(${buses.length}, minmax(0, 1fr))` }}>
            {buses.map(bus => (
              <BusColumn
                key={bus.id}
                bus={bus}
                assignments={assignmentsByBus[bus.id] ?? []}
                allBuses={buses}
                manualDraft={manualNameByBus[bus.id] ?? ''}
                onManualDraftChange={v => setManualNameByBus(m => ({ ...m, [bus.id]: v }))}
                onAddManual={() => {
                  const name = (manualNameByBus[bus.id] ?? '').trim()
                  if (!name) return
                  addManual.mutate({ busId: bus.id, name })
                  setManualNameByBus(m => ({ ...m, [bus.id]: '' }))
                }}
                onRemove={id => removeAssignment.mutate(id)}
                onMove={(assignmentId, targetBusId) =>
                  moveAssignment.mutate({ assignmentId, targetBusId })
                }
                onCapacityChange={capacity =>
                  updateBusCapacity.mutate({ busId: bus.id, capacity })
                }
                onDeleteBus={() => {
                  if (!window.confirm(`حذف باص ${bus.bus_number}؟`)) return
                  deleteBus.mutate(bus.id)
                }}
                canDelete={(assignmentsByBus[bus.id] ?? []).length === 0}
                isDeleting={deleteBus.isPending}
                dragAssignmentId={dragAssignmentId}
                setDragAssignmentId={setDragAssignmentId}
                onDrop={() => handleDrop(bus.id)}
              />
            ))}
          </div>

          {activeBus && (
            <div className="lg:hidden">
              <BusColumn
                bus={activeBus}
                assignments={assignmentsByBus[activeBus.id] ?? []}
                allBuses={buses}
                manualDraft={manualNameByBus[activeBus.id] ?? ''}
                onManualDraftChange={v => setManualNameByBus(m => ({ ...m, [activeBus.id]: v }))}
                onAddManual={() => {
                  const name = (manualNameByBus[activeBus.id] ?? '').trim()
                  if (!name) return
                  addManual.mutate({ busId: activeBus.id, name })
                  setManualNameByBus(m => ({ ...m, [activeBus.id]: '' }))
                }}
                onRemove={id => removeAssignment.mutate(id)}
                onMove={(assignmentId, targetBusId) =>
                  moveAssignment.mutate({ assignmentId, targetBusId })
                }
                onCapacityChange={capacity =>
                  updateBusCapacity.mutate({ busId: activeBus.id, capacity })
                }
                onDeleteBus={() => {
                  if (!window.confirm(`حذف باص ${activeBus.bus_number}؟`)) return
                  deleteBus.mutate(activeBus.id)
                }}
                canDelete={(assignmentsByBus[activeBus.id] ?? []).length === 0}
                isDeleting={deleteBus.isPending}
                dragAssignmentId={dragAssignmentId}
                setDragAssignmentId={setDragAssignmentId}
                onDrop={() => handleDrop(activeBus.id)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BusColumn({
  bus,
  assignments,
  allBuses,
  manualDraft,
  onManualDraftChange,
  onAddManual,
  onRemove,
  onMove,
  onCapacityChange,
  onDeleteBus,
  canDelete,
  isDeleting,
  dragAssignmentId,
  setDragAssignmentId,
  onDrop,
}: {
  bus: BusRow
  assignments: AssignmentRow[]
  allBuses: BusRow[]
  manualDraft: string
  onManualDraftChange: (v: string) => void
  onAddManual: () => void
  onRemove: (id: string) => void
  onMove: (assignmentId: string, targetBusId: string) => void
  onCapacityChange: (capacity: number) => void
  onDeleteBus: () => void
  canDelete: boolean
  isDeleting: boolean
  dragAssignmentId: string | null
  setDragAssignmentId: (id: string | null) => void
  onDrop: () => void
}) {
  const count = assignments.length
  const over = count > bus.capacity
  const [capacityDraft, setCapacityDraft] = useState(String(bus.capacity))

  useEffect(() => {
    setCapacityDraft(String(bus.capacity))
  }, [bus.capacity])

  const commitCapacity = () => {
    const n = Number(capacityDraft)
    if (!Number.isFinite(n) || n < 1) {
      setCapacityDraft(String(bus.capacity))
      return
    }
    if (n !== bus.capacity) onCapacityChange(n)
  }

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm flex flex-col min-h-[280px] ${
        over ? 'border-red-300' : 'border-gray-100'
      }`}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={e => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div className={`px-3 py-3 border-b rounded-t-xl ${over ? 'bg-red-50' : 'bg-emerald-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-emerald-800/80 font-medium uppercase tracking-wide">باص</p>
            <p className="text-3xl font-bold text-emerald-900 leading-none">{bus.bus_number}</p>
            <p className="text-xs text-gray-600 mt-1 truncate">{bus.bus_name ?? `باص ${bus.bus_number}`}</p>
          </div>
          <button
            type="button"
            onClick={onDeleteBus}
            disabled={!canDelete || isDeleting}
            title={canDelete ? 'حذف الباص' : 'لا يمكن الحذف — يوجد ركاب'}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="حذف الباص"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-600 shrink-0">السعة</label>
          <input
            type="number"
            min={1}
            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center bg-white"
            value={capacityDraft}
            onChange={e => setCapacityDraft(e.target.value)}
            onBlur={commitCapacity}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className={`text-xs ${over ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
            العدد: {count} / {bus.capacity}
          </span>
        </div>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[420px]">
        {assignments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">اسحب أسماء هنا أو وزّع تلقائياً</p>
        ) : (
          assignments.map(a => (
            <div
              key={a.id}
              draggable
              onDragStart={() => setDragAssignmentId(a.id)}
              onDragEnd={() => setDragAssignmentId(null)}
              className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${
                dragAssignmentId === a.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-100 bg-gray-50'
              } ${a.is_manual ? 'border-purple-200 bg-purple-50/50' : ''}`}
            >
              <GripVertical size={14} className="text-gray-400 shrink-0 mt-0.5 cursor-grab" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate">{displayName(a)}</p>
                {a.room_number && (
                  <p className="text-xs text-gray-500">غرفة {a.room_number}</p>
                )}
                {a.is_manual && <span className="text-[10px] text-purple-600">إضافة يدوية</span>}
                {allBuses.length > 1 && (
                  <select
                    className="mt-1 w-full text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                    value={a.bus_id}
                    onChange={e => onMove(a.id, e.target.value)}
                  >
                    {allBuses.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bus_name ?? `باص ${b.bus_number}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                aria-label="حذف"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t border-gray-100 flex gap-1">
        <input
          type="text"
          placeholder="اسم إضافي (كادر...)"
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
          value={manualDraft}
          onChange={e => onManualDraftChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAddManual()}
        />
        <button
          type="button"
          onClick={onAddManual}
          className="shrink-0 bg-emerald-700 text-white p-1.5 rounded-lg"
          aria-label="إضافة"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}
