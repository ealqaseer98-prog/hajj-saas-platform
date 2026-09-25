// src/pages/UmrahTripWorkspacePage.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArrowRight, Users, UserPlus, UserMinus, Building2, ClipboardList, Plus, Edit2, Trash2, BedDouble, AlertTriangle, Printer, Wallet, Tag, FileText, ChevronDown, ChevronUp, Download, Bus, Plane, Columns3 } from 'lucide-react'
import type { UmrahTrip, UmrahTraveller, UmrahTravellerTrip, UmrahHotel, UmrahManifestEntry, UmrahRoom, RoomType, UmrahIncome, UmrahExpense, UmrahExpenseCategory, UmrahTripPricing, UmrahPricingExpense, UmrahPricingExpenseRule, UmrahInvoice, UmrahInvoiceRoomType, UmrahTransport, UmrahTransportType, Gender } from '../types'
import { ROOM_TYPE_AR, ROOM_TYPE_CAPACITY } from '../lib/roomTypes'
import { useAuthStore } from '../store/authStore'

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

type Tab = 'travellers' | 'hotels' | 'rooms' | 'distribution' | 'manifest' | 'finance' | 'pricing' | 'invoices'

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'travellers',   label: 'المسافرون',  icon: Users },
  { key: 'hotels',       label: 'الفنادق',     icon: Building2 },
  { key: 'rooms',        label: 'الغرف',       icon: BedDouble },
  { key: 'distribution', label: 'التوزيع',    icon: Bus },
  { key: 'manifest',     label: 'المنافيست',   icon: ClipboardList },
  { key: 'finance',      label: 'المالية',    icon: Wallet },
  { key: 'pricing',      label: 'التسعير',    icon: Tag },
  { key: 'invoices',     label: 'الفواتير',   icon: FileText },
]

const EXPENSE_CATEGORY_AR: Record<UmrahExpenseCategory, string> = {
  hotel:     'فندق',
  transport: 'نقل',
  visa:      'تأشيرة',
  food:      'طعام',
  other:     'أخرى',
}

const INVOICE_ROOM_TYPE_AR: Record<UmrahInvoiceRoomType, string> = {
  quad:   'رباعية',
  triple: 'ثلاثية',
  double: 'ثنائية',
  single: 'فردية',
  child:  'طفل',
  infant: 'رضيع',
}

const INVOICE_PRICE_KEY: Record<UmrahInvoiceRoomType, keyof Pick<UmrahTripPricing, 'price_quad' | 'price_triple' | 'price_double' | 'price_single' | 'price_child' | 'price_infant'>> = {
  quad:   'price_quad',
  triple: 'price_triple',
  double: 'price_double',
  single: 'price_single',
  child:  'price_child',
  infant: 'price_infant',
}

function formatBhd(n: number) {
  return `${n.toFixed(3)} BHD`
}

function nullNum(v: number | undefined | null) {
  return v == null || Number.isNaN(Number(v)) ? null : Number(v)
}

function numOrZero(v: number | undefined | null) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000
}

function parseInputNum(raw: string): number | undefined {
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

type CampaignPrintHeader = { text: string; logoUrl: string | null }

function useCampaignPrintHeader(): CampaignPrintHeader {
  const campaignId = useAuthStore(s => s.user?.campaign_id)
  const { data } = useQuery({
    queryKey: ['campaign-print-header', campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('campaign_name_ar, license_number, logo_url')
        .eq('id', campaignId!)
        .maybeSingle()
      return (data ?? null) as {
        campaign_name_ar: string | null
        license_number: string | null
        logo_url: string | null
      } | null
    },
    enabled: !!campaignId,
  })
  const name = (data?.campaign_name_ar ?? '').trim()
  const license = (data?.license_number ?? '').trim()
  const logoUrl = (data?.logo_url ?? '').trim() || null
  const text = !name ? '' : !license ? name : `${name} - رخصة رقم ${license}`

  useEffect(() => {
    if (!logoUrl) return
    const img = new Image()
    img.src = logoUrl
  }, [logoUrl])

  return { text, logoUrl }
}

function PrintCampaignHeader({ header }: { header: CampaignPrintHeader }) {
  const logoUrl = header.logoUrl
  if (!logoUrl && !header.text) return null
  return (
    <div style={{ textAlign: 'center', marginBottom: '12px' }}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          style={{
            maxHeight: '72px',
            maxWidth: '220px',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto 8px',
          }}
        />
      )}
      {header.text ? (
        <p style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#000' }}>
          {header.text}
        </p>
      ) : null}
    </div>
  )
}

export default function UmrahTripWorkspacePage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('travellers')

  const campaignPrintHeader = useCampaignPrintHeader()

  const { data: trip } = useQuery({
    queryKey: ['umrah-trip', id],
    queryFn: async () => {
      const { data } = await supabase.from('umrah_trips').select('*').eq('id', id!).single()
      return data as UmrahTrip
    },
    enabled: !!id,
  })

  const { data: enrolled = [] } = useQuery({
    queryKey: ['umrah-trip-travellers', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_traveller_trips')
        .select('*, traveller:umrah_travellers(*)')
        .eq('umrah_trip_id', id!)
      return (data ?? []) as UmrahTravellerTrip[]
    },
    enabled: !!id,
  })

  if (!trip || !id) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      {campaignPrintHeader.logoUrl && (
        <img
          src={campaignPrintHeader.logoUrl}
          alt=""
          aria-hidden
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      )}
      <button onClick={() => navigate('/umrah/trips')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
        <ArrowRight size={16} /> العودة إلى رحلات العمرة
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-800">{trip.trip_name}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          {trip.departure_date && <span>المغادرة: {trip.departure_date}</span>}
          {trip.return_date    && <span>العودة: {trip.return_date}</span>}
          {trip.max_travellers != null && <span>السعة: {enrolled.length}/{trip.max_travellers}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key ? 'bg-emerald-700 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'travellers'   && <TravellersTab tripId={id} enrolled={enrolled} maxTravellers={trip.max_travellers} />}
      {activeTab === 'hotels'       && <HotelsTab tripId={id} />}
      {activeTab === 'rooms'        && <RoomsTab tripId={id} enrolled={enrolled} />}
      {activeTab === 'distribution' && <DistributionTab tripId={id} enrolled={enrolled} />}
      {activeTab === 'manifest'     && <ManifestTab tripId={id} tripName={trip.trip_name} campaignPrintHeader={campaignPrintHeader} />}
      {activeTab === 'finance'      && <FinanceTab tripId={id} trip={trip} campaignPrintHeader={campaignPrintHeader} />}
      {activeTab === 'pricing'      && <PricingTab tripId={id} />}
      {activeTab === 'invoices'     && <InvoicesTab tripId={id} tripName={trip.trip_name} enrolled={enrolled} campaignPrintHeader={campaignPrintHeader} />}
    </div>
  )
}

// ─── المسافرون ──────────────────────────────────────────────────────────────

function TravellersTab({ tripId, enrolled }: { tripId: string; enrolled: UmrahTravellerTrip[]; maxTravellers: number | null }) {
  const qc = useQueryClient()
  const [travellerSearch, setSearch] = useState('')
  const [showAddTraveller, setShowAddTraveller] = useState(false)

  const { data: allTravellers = [] } = useQuery({
    queryKey: ['umrah-travellers-search', travellerSearch],
    queryFn: async () => {
      let q = supabase.from('umrah_travellers').select('id, full_name_ar, cpr_number').order('full_name_ar')
      if (travellerSearch) q = q.ilike('full_name_ar', `%${travellerSearch}%`)
      const { data } = await q.limit(10)
      return (data ?? []) as UmrahTraveller[]
    },
    enabled: showAddTraveller,
  })

  const enrollTraveller = useMutation({
    mutationFn: (travellerId: string) =>
      supabase.from('umrah_traveller_trips').insert({ umrah_trip_id: tripId, umrah_traveller_id: travellerId, status: 'confirmed' }).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['umrah-trip-travellers', tripId] }); setShowAddTraveller(false) },
  })

  const unenrollTraveller = useMutation({
    mutationFn: (ttId: string) => supabase.from('umrah_traveller_trips').delete().eq('id', ttId).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-trip-travellers', tripId] }),
  })

  const enrolledIds = enrolled.map(e => e.umrah_traveller_id)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Users size={15} /> المعتمرون ({enrolled.length})
        </h2>
        <button onClick={() => setShowAddTraveller(!showAddTraveller)}
          className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
          <UserPlus size={12} /> إضافة مسافر
        </button>
      </div>

      {showAddTraveller && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-2">
          <input
            className={ic}
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
        {enrolled.map(e => (
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
  )
}

// ─── الفنادق ────────────────────────────────────────────────────────────────

const EMPTY_HOTEL: Partial<UmrahHotel> = { hotel_name: '', city: '', check_in: '', check_out: '', room_count: undefined, notes: '' }

function HotelsTab({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Partial<UmrahHotel>>(EMPTY_HOTEL)

  const { data: hotels = [], isLoading } = useQuery({
    queryKey: ['umrah-hotels', tripId],
    queryFn: async () => {
      const { data } = await supabase.from('umrah_hotels').select('*').eq('umrah_trip_id', tripId).order('check_in')
      return (data ?? []) as UmrahHotel[]
    },
  })

  const save = useMutation({
    mutationFn: async (h: Partial<UmrahHotel>) => {
      const payload = { ...h, check_in: h.check_in || null, check_out: h.check_out || null }
      if (modal === 'add') {
        await supabase.from('umrah_hotels').insert({ ...payload, umrah_trip_id: tripId }).throwOnError()
      } else {
        const { id, created_at, ...rest } = payload as UmrahHotel
        await supabase.from('umrah_hotels').update(rest).eq('id', id).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-hotels', tripId] })
      setModal(null)
      setSelected(EMPTY_HOTEL)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_hotels').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-hotels', tripId] }),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Building2 size={15} /> الفنادق ({hotels.length})
        </h2>
        <button onClick={() => { setSelected(EMPTY_HOTEL); setModal('add') }}
          className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={12} /> إضافة فندق
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {hotels.map(h => (
            <div key={h.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-gray-800">{h.hotel_name}</span>
                {h.city && <span className="text-gray-400 text-xs mr-2">{h.city}</span>}
                {(h.check_in || h.check_out) && (
                  <span className="text-gray-400 text-xs mr-2">
                    {h.check_in ?? '—'} → {h.check_out ?? '—'}
                  </span>
                )}
                {h.room_count != null && <span className="text-gray-400 text-xs mr-2">{h.room_count} غرفة</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelected(h); setModal('edit') }}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => window.confirm('حذف الفندق؟') && del.mutate(h.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {hotels.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لم تتم إضافة فنادق لهذه الرحلة</p>}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">{modal === 'add' ? 'إضافة فندق' : 'تعديل الفندق'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">اسم الفندق *</label>
                <input className={ic} value={selected.hotel_name ?? ''}
                  onChange={e => setSelected(s => ({ ...s, hotel_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">المدينة</label>
                  <input className={ic} value={selected.city ?? ''}
                    onChange={e => setSelected(s => ({ ...s, city: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">عدد الغرف</label>
                  <input className={ic} type="number" value={selected.room_count ?? ''}
                    onChange={e => setSelected(s => ({ ...s, room_count: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ الوصول</label>
                  <input className={ic} type="date" value={selected.check_in ?? ''}
                    onChange={e => setSelected(s => ({ ...s, check_in: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ المغادرة</label>
                  <input className={ic} type="date" value={selected.check_out ?? ''}
                    onChange={e => setSelected(s => ({ ...s, check_out: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                <textarea className={ic + ' resize-none'} rows={2} value={selected.notes ?? ''}
                  onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => save.mutate(selected)}
                disabled={save.isPending || !selected.hotel_name}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setModal(null); setSelected(EMPTY_HOTEL) }}
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

// ─── الغرف ──────────────────────────────────────────────────────────────────

const EMPTY_ROOM: Partial<UmrahRoom> = { room_number: '', umrah_hotel_id: null, room_type: 'quad', capacity: 4, floor: '', notes: '' }

function RoomsTab({ tripId, enrolled }: { tripId: string; enrolled: UmrahTravellerTrip[] }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Partial<UmrahRoom>>(EMPTY_ROOM)
  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [selectedTraveller, setSelectedTraveller] = useState('')
  const [noRoomListModal, setNoRoomListModal] = useState(false)

  const { data: hotels = [] } = useQuery({
    queryKey: ['umrah-hotels', tripId],
    queryFn: async () => {
      const { data } = await supabase.from('umrah_hotels').select('*').eq('umrah_trip_id', tripId).order('check_in')
      return (data ?? []) as UmrahHotel[]
    },
  })

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['umrah-rooms', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_rooms')
        .select('*, assignments:umrah_room_assignments(*, traveller:umrah_travellers(id, full_name_ar, cpr_number))')
        .eq('umrah_trip_id', tripId)
        .order('room_number')
      return (data ?? []) as UmrahRoom[]
    },
  })

  const save = useMutation({
    mutationFn: async (r: Partial<UmrahRoom>) => {
      const payload = {
        room_number:    r.room_number,
        umrah_hotel_id: r.umrah_hotel_id || null,
        room_type:      r.room_type || null,
        capacity:       r.capacity || null,
        floor:          r.floor || null,
        notes:          r.notes || null,
      }
      if (modal === 'add') {
        await supabase.from('umrah_rooms').insert({ ...payload, umrah_trip_id: tripId }).throwOnError()
      } else {
        await supabase.from('umrah_rooms').update(payload).eq('id', r.id!).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-rooms', tripId] })
      setModal(null)
      setSelected(EMPTY_ROOM)
    },
  })

  const deleteRoom = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_rooms').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-rooms', tripId] }),
  })

  const assignTraveller = useMutation({
    mutationFn: ({ roomId, travellerId }: { roomId: string; travellerId: string }) =>
      supabase.from('umrah_room_assignments')
        .insert({ umrah_trip_id: tripId, umrah_room_id: roomId, umrah_traveller_id: travellerId })
        .throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-rooms', tripId] })
      setAssignModal(null)
      setAssignSearch('')
      setSelectedTraveller('')
    },
  })

  const removeAssignment = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_room_assignments').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-rooms', tripId] }),
  })

  const roster = enrolled.map(e => e.traveller).filter(Boolean) as UmrahTraveller[]
  const assignedIds = rooms.flatMap(r => (r.assignments ?? []).map(a => a.umrah_traveller_id))
  const unassigned = roster.filter(t => !assignedIds.includes(t.id))
  const withoutRoomCount = unassigned.length
  const totalCapacity = rooms.reduce((s, r) => s + (r.capacity ?? 0), 0)

  const assignSearchTerm = assignSearch.trim().toLowerCase()
  const matchingAssignable = assignSearchTerm
    ? unassigned.filter(t => (t.full_name_ar ?? '').toLowerCase().includes(assignSearchTerm))
    : []

  const groups: { key: string; label: string; rooms: UmrahRoom[] }[] = [
    ...hotels.map(h => ({ key: h.id, label: h.hotel_name, rooms: rooms.filter(r => r.umrah_hotel_id === h.id) })),
    { key: 'none', label: 'بدون فندق', rooms: rooms.filter(r => !r.umrah_hotel_id) },
  ].filter(g => g.rooms.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BedDouble size={15} /> الغرف ({rooms.length})
          </h2>
          {withoutRoomCount > 0 && (
            <button onClick={() => setNoRoomListModal(true)}
              className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded-lg hover:bg-amber-100">
              <AlertTriangle size={12} /> {withoutRoomCount} بدون غرفة
            </button>
          )}
        </div>
        <button onClick={() => { setSelected(EMPTY_ROOM); setModal('add') }}
          className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={12} /> إضافة غرفة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'عدد الغرف', value: rooms.length },
          { label: 'المعتمرون المعيّنون', value: assignedIds.length },
          { label: 'الإشغال', value: totalCapacity ? `${Math.round((assignedIds.length / totalCapacity) * 100)}%` : '—' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>}

      {!isLoading && groups.map(group => (
        <div key={group.key} className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500">{group.label}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.rooms.map(room => {
              const occupancy = (room.assignments ?? []).length
              const capacity  = room.capacity ?? 0
              const isFull    = capacity > 0 && occupancy >= capacity
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
                      {room.room_type && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {ROOM_TYPE_AR[room.room_type as RoomType] ?? room.room_type}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${isFull ? 'text-red-600' : 'text-emerald-600'}`}>
                        {occupancy}/{capacity || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 min-h-[40px]">
                    {(room.assignments ?? []).map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 text-sm">
                        <span className="text-gray-700 truncate min-w-0 flex-1">{a.traveller?.full_name_ar}</span>
                        <button onClick={() => removeAssignment.mutate(a.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {isEmpty && <p className="text-xs text-gray-300 italic">لا يوجد معتمرون</p>}
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                      style={{ width: `${capacity ? Math.min(100, (occupancy / capacity) * 100) : 0}%` }} />
                  </div>

                  <div className="flex gap-2">
                    {!isFull && (
                      <button onClick={() => { setAssignModal(room.id); setSelectedTraveller(''); setAssignSearch('') }}
                        className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors flex-1 justify-center">
                        <UserPlus size={12} /> إضافة معتمر
                      </button>
                    )}
                    <button title="تعديل الغرفة"
                      onClick={() => { setSelected(room); setModal('edit') }}
                      className="text-xs text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => window.confirm('حذف الغرفة؟') && deleteRoom.mutate(room.id)}
                      className="text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {!isLoading && rooms.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          لم يتم إضافة غرف بعد
        </div>
      )}

      {/* Add/Edit room modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">{modal === 'add' ? 'إضافة غرفة' : 'تعديل الغرفة'}</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم الغرفة *</label>
              <input className={ic} value={selected.room_number ?? ''}
                onChange={e => setSelected(s => ({ ...s, room_number: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الفندق</label>
              <select className={ic} value={selected.umrah_hotel_id ?? ''}
                onChange={e => setSelected(s => ({ ...s, umrah_hotel_id: e.target.value || null }))}>
                <option value="">بدون فندق</option>
                {hotels.map(h => <option key={h.id} value={h.id}>{h.hotel_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">نوع الغرفة</label>
                <select className={ic} value={selected.room_type ?? 'quad'}
                  onChange={e => {
                    const room_type = e.target.value as RoomType
                    setSelected(s => ({ ...s, room_type, capacity: ROOM_TYPE_CAPACITY[room_type] }))
                  }}>
                  {Object.entries(ROOM_TYPE_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">السعة</label>
                <input className={ic} type="number" min={1} value={selected.capacity ?? ''}
                  onChange={e => setSelected(s => ({ ...s, capacity: e.target.value ? +e.target.value : undefined }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الطابق</label>
              <input className={ic} value={selected.floor ?? ''}
                onChange={e => setSelected(s => ({ ...s, floor: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <textarea className={ic + ' resize-none'} rows={2} value={selected.notes ?? ''}
                onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => save.mutate(selected)}
                disabled={save.isPending || !selected.room_number}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setModal(null); setSelected(EMPTY_ROOM) }}
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
            <h2 className="text-lg font-bold">إضافة معتمر للغرفة</h2>
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">المعتمر</label>
              <input type="text" className={ic} value={assignSearch}
                placeholder="ابحث باسم المعتمر..."
                onChange={e => { setAssignSearch(e.target.value); setSelectedTraveller('') }}
                autoComplete="off" />
              {assignSearch.trim() && matchingAssignable.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {matchingAssignable.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => { setSelectedTraveller(t.id); setAssignSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {t.full_name_ar} <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                    </button>
                  ))}
                </div>
              )}
              {assignSearch.trim() && matchingAssignable.length === 0 && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">لا توجد نتائج مطابقة</p>
              )}
              {!assignSearch.trim() && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">ابدأ بكتابة اسم المعتمر للبحث والاختيار</p>
              )}
            </div>
            {unassigned.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                جميع معتمري الرحلة قد تم تعيينهم لغرف
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => selectedTraveller && assignTraveller.mutate({ roomId: assignModal, travellerId: selectedTraveller })}
                disabled={assignTraveller.isPending || !selectedTraveller}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                تعيين
              </button>
              <button onClick={() => { setAssignModal(null); setAssignSearch(''); setSelectedTraveller('') }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Without-room list modal */}
      {noRoomListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog" aria-modal="true"
          onClick={e => { if (e.target === e.currentTarget) setNoRoomListModal(false) }}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl" dir="rtl"
            onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-800">بدون غرفة</h2>
              <p className="mt-2 text-sm font-medium text-emerald-700">العدد: {withoutRoomCount}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {unassigned.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">لا يوجد معتمرون بدون غرفة</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {unassigned.map(t => (
                    <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                      <span className="font-medium text-gray-800">{t.full_name_ar}</span>
                      <span className="font-mono text-xs text-gray-600 tabular-nums" dir="ltr">{t.cpr_number ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-100 px-5 py-3">
              <button onClick={() => setNoRoomListModal(false)}
                className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── التوزيع ────────────────────────────────────────────────────────────────

function emptyTransport(type: UmrahTransportType): Partial<UmrahTransport> {
  return {
    transport_type: type,
    name: '',
    capacity: undefined,
    bus_driver: '',
    bus_plate: '',
    flight_number: '',
    airline: '',
    departure_time: '',
    notes: '',
  }
}

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  // Accept "YYYY-MM-DDTHH:mm" or ISO with seconds/Z
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  return m ? m[1] : value.slice(0, 16)
}

function DistributionTab({ tripId, enrolled }: { tripId: string; enrolled: UmrahTravellerTrip[] }) {
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<UmrahTransportType>('bus')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Partial<UmrahTransport>>(emptyTransport('bus'))
  const [assignModal, setAssignModal] = useState<string | null>(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [selectedTraveller, setSelectedTraveller] = useState('')
  const [seatNumber, setSeatNumber] = useState('')
  const [printUnit, setPrintUnit] = useState<UmrahTransport | null>(null)

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['umrah-transport', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_transport')
        .select('*, assignments:umrah_transport_assignments(*, traveller:umrah_travellers(id, full_name_ar, cpr_number, passport_number))')
        .eq('umrah_trip_id', tripId)
        .order('name')
      return (data ?? []) as UmrahTransport[]
    },
  })

  const filtered = units.filter(u => u.transport_type === subTab)
  const isBus = subTab === 'bus'
  const TypeIcon = isBus ? Bus : Plane

  const roster = enrolled.map(e => e.traveller).filter(Boolean) as UmrahTraveller[]
  const assignedTransportIds = units.flatMap(u => (u.assignments ?? []).map(a => a.umrah_traveller_id))
  const unassigned = roster.filter(t => !assignedTransportIds.includes(t.id))
  const withoutCount = unassigned.length
  const totalCapacity = filtered.reduce((s, u) => s + (u.capacity ?? 0), 0)
  const totalAssigned = filtered.reduce((s, u) => s + (u.assignments ?? []).length, 0)

  const assignSearchTerm = assignSearch.trim().toLowerCase()
  const matchingAssignable = assignSearchTerm
    ? unassigned.filter(t => (t.full_name_ar ?? '').toLowerCase().includes(assignSearchTerm))
    : []

  const save = useMutation({
    mutationFn: async (row: Partial<UmrahTransport>) => {
      const payload = {
        transport_type: subTab,
        name: row.name,
        capacity: nullNum(row.capacity),
        bus_driver: isBus ? (row.bus_driver || null) : null,
        bus_plate: isBus ? (row.bus_plate || null) : null,
        flight_number: !isBus ? (row.flight_number || null) : null,
        airline: !isBus ? (row.airline || null) : null,
        departure_time: !isBus ? (row.departure_time || null) : null,
        notes: row.notes || null,
      }
      if (modal === 'add') {
        await supabase.from('umrah_transport').insert({ ...payload, umrah_trip_id: tripId }).throwOnError()
      } else {
        await supabase.from('umrah_transport').update(payload).eq('id', row.id!).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-transport', tripId] })
      setModal(null)
      setSelected(emptyTransport(subTab))
    },
  })

  const deleteUnit = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('umrah_transport_assignments').delete().eq('umrah_transport_id', id).throwOnError()
      await supabase.from('umrah_transport').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-transport', tripId] }),
  })

  const assignTraveller = useMutation({
    mutationFn: ({ transportId, travellerId, seat }: { transportId: string; travellerId: string; seat: string }) =>
      supabase.from('umrah_transport_assignments')
        .insert({
          umrah_trip_id: tripId,
          umrah_transport_id: transportId,
          umrah_traveller_id: travellerId,
          seat_number: seat || null,
        })
        .throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-transport', tripId] })
      setAssignModal(null)
      setAssignSearch('')
      setSelectedTraveller('')
      setSeatNumber('')
    },
  })

  const removeAssignment = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_transport_assignments').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-transport', tripId] }),
  })

  useEffect(() => {
    if (!printUnit) return
    const clear = () => setPrintUnit(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [printUnit])

  const handlePrint = (unit: UmrahTransport) => {
    setPrintUnit(unit)
    setTimeout(() => window.print(), 50)
  }

  const openAdd = () => {
    setSelected(emptyTransport(subTab))
    setModal('add')
  }

  return (
    <>
    <div className="space-y-4 print:hidden">
      <div className="flex items-center gap-2">
        {([
          { key: 'bus' as const, label: 'الباصات', icon: Bus },
          { key: 'flight' as const, label: 'الرحلات الجوية', icon: Plane },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setSubTab(key); setModal(null); setAssignModal(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === key ? 'bg-emerald-700 text-white' : 'text-gray-500 hover:bg-gray-100 bg-white border border-gray-100'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <TypeIcon size={15} /> {isBus ? 'الباصات' : 'الرحلات الجوية'} ({filtered.length})
          </h2>
          {withoutCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded-lg">
              <AlertTriangle size={12} /> {withoutCount} بدون توزيع
            </span>
          )}
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={12} /> {isBus ? 'إضافة باص' : 'إضافة رحلة'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: isBus ? 'عدد الباصات' : 'عدد الرحلات', value: filtered.length },
          { label: 'المعتمرون المعيّنون', value: totalAssigned },
          { label: 'الإشغال', value: totalCapacity ? `${Math.round((totalAssigned / totalCapacity) * 100)}%` : '—' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(unit => {
            const occupancy = (unit.assignments ?? []).length
            const capacity = unit.capacity ?? 0
            const isFull = capacity > 0 && occupancy >= capacity
            const isEmpty = occupancy === 0

            return (
              <div key={unit.id}
                className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${isFull ? 'border-red-200' : isEmpty ? 'border-gray-100' : 'border-green-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon size={16} className="text-gray-400 shrink-0" />
                    <span className="font-bold text-gray-800 truncate">{unit.name}</span>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${isFull ? 'text-red-600' : 'text-emerald-600'}`}>
                    {occupancy}/{capacity || '—'}
                  </span>
                </div>

                <div className="text-xs text-gray-500 space-y-0.5">
                  {isBus ? (
                    <>
                      {unit.bus_driver && <p>السائق: {unit.bus_driver}</p>}
                      {unit.bus_plate && <p>اللوحة: <span className="font-mono" dir="ltr">{unit.bus_plate}</span></p>}
                    </>
                  ) : (
                    <>
                      {unit.flight_number && <p>رقم الرحلة: <span className="font-mono" dir="ltr">{unit.flight_number}</span></p>}
                      {unit.airline && <p>الشركة: {unit.airline}</p>}
                      {unit.departure_time && <p>المغادرة: <span dir="ltr">{unit.departure_time}</span></p>}
                    </>
                  )}
                </div>

                <div className="space-y-1.5 min-h-[40px]">
                  {(unit.assignments ?? []).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 text-sm">
                      <span className="text-gray-700 truncate min-w-0 flex-1">
                        {a.traveller?.full_name_ar}
                        {a.seat_number && <span className="text-gray-400 text-xs mr-1">({a.seat_number})</span>}
                      </span>
                      <button onClick={() => removeAssignment.mutate(a.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {isEmpty && <p className="text-xs text-gray-300 italic">لا يوجد معتمرون</p>}
                </div>

                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                    style={{ width: `${capacity ? Math.min(100, (occupancy / capacity) * 100) : 0}%` }} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {!isFull && (
                    <button onClick={() => { setAssignModal(unit.id); setSelectedTraveller(''); setAssignSearch(''); setSeatNumber('') }}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors flex-1 justify-center">
                      <UserPlus size={12} /> إضافة معتمر
                    </button>
                  )}
                  <button onClick={() => handlePrint(unit)} title="طباعة القائمة"
                    className="text-xs text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">
                    <Printer size={12} />
                  </button>
                  <button title="تعديل"
                    onClick={() => {
                      setSelected({
                        ...unit,
                        departure_time: toDatetimeLocal(unit.departure_time),
                        capacity: unit.capacity ?? undefined,
                      })
                      setModal('edit')
                    }}
                    className="text-xs text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => window.confirm(isBus ? 'حذف الباص؟' : 'حذف الرحلة؟') && deleteUnit.mutate(unit.id)}
                    className="text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          {isBus ? 'لم يتم إضافة باصات بعد' : 'لم يتم إضافة رحلات بعد'}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">
              {modal === 'add'
                ? (isBus ? 'إضافة باص' : 'إضافة رحلة')
                : (isBus ? 'تعديل الباص' : 'تعديل الرحلة')}
            </h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الاسم *</label>
              <input className={ic} value={selected.name ?? ''}
                onChange={e => setSelected(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">السعة</label>
              <input className={ic} type="number" min={1} value={selected.capacity ?? ''}
                onChange={e => setSelected(s => ({
                  ...s,
                  capacity: e.target.value === '' ? undefined : +e.target.value,
                }))} />
            </div>
            {isBus ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">السائق</label>
                  <input className={ic} value={selected.bus_driver ?? ''}
                    onChange={e => setSelected(s => ({ ...s, bus_driver: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">رقم اللوحة</label>
                  <input className={ic} dir="ltr" value={selected.bus_plate ?? ''}
                    onChange={e => setSelected(s => ({ ...s, bus_plate: e.target.value }))} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">رقم الرحلة</label>
                    <input className={ic} dir="ltr" value={selected.flight_number ?? ''}
                      onChange={e => setSelected(s => ({ ...s, flight_number: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">شركة الطيران</label>
                    <input className={ic} value={selected.airline ?? ''}
                      onChange={e => setSelected(s => ({ ...s, airline: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">وقت المغادرة</label>
                  <input className={ic} type="datetime-local" value={toDatetimeLocal(selected.departure_time)}
                    onChange={e => setSelected(s => ({ ...s, departure_time: e.target.value }))} />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <textarea className={ic + ' resize-none'} rows={2} value={selected.notes ?? ''}
                onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => save.mutate(selected)}
                disabled={save.isPending || !selected.name}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setModal(null); setSelected(emptyTransport(subTab)) }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3" dir="rtl">
            <h2 className="text-lg font-bold">{isBus ? 'إضافة معتمر للباص' : 'إضافة معتمر للرحلة'}</h2>
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">المعتمر</label>
              <input type="text" className={ic} value={assignSearch}
                placeholder="ابحث باسم المعتمر..."
                onChange={e => { setAssignSearch(e.target.value); setSelectedTraveller('') }}
                autoComplete="off" />
              {assignSearch.trim() && matchingAssignable.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {matchingAssignable.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => { setSelectedTraveller(t.id); setAssignSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {t.full_name_ar} <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                    </button>
                  ))}
                </div>
              )}
              {assignSearch.trim() && matchingAssignable.length === 0 && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">لا توجد نتائج مطابقة</p>
              )}
              {!assignSearch.trim() && unassigned.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">ابدأ بكتابة اسم المعتمر للبحث والاختيار</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم المقعد (اختياري)</label>
              <input className={ic} value={seatNumber}
                onChange={e => setSeatNumber(e.target.value)} />
            </div>
            {unassigned.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                جميع معتمري الرحلة معيّنون على باص أو رحلة جوية
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => selectedTraveller && assignTraveller.mutate({
                  transportId: assignModal,
                  travellerId: selectedTraveller,
                  seat: seatNumber,
                })}
                disabled={assignTraveller.isPending || !selectedTraveller}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                تعيين
              </button>
              <button onClick={() => { setAssignModal(null); setAssignSearch(''); setSelectedTraveller(''); setSeatNumber('') }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {printUnit && (
      <div id="umrah-transport-print" className="hidden print:block" dir="rtl">
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', color: '#000' }}>
          {printUnit.transport_type === 'bus' ? 'قائمة الباص' : 'قائمة الرحلة'} — {printUnit.name}
        </h1>
        <div style={{ fontSize: '13px', marginBottom: '16px', color: '#000' }}>
          {printUnit.transport_type === 'bus' ? (
            <>
              {printUnit.bus_driver && <p>السائق: {printUnit.bus_driver}</p>}
              {printUnit.bus_plate && <p>اللوحة: {printUnit.bus_plate}</p>}
            </>
          ) : (
            <>
              {printUnit.flight_number && <p>رقم الرحلة: {printUnit.flight_number}</p>}
              {printUnit.airline && <p>الشركة: {printUnit.airline}</p>}
              {printUnit.departure_time && <p>المغادرة: {printUnit.departure_time}</p>}
            </>
          )}
          <p>السعة: {(printUnit.assignments ?? []).length}/{printUnit.capacity ?? '—'}</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000' }}>
          <thead>
            <tr>
              <th style={printTh}>#</th>
              <th style={printTh}>الاسم</th>
              <th style={printTh}>رقم الجواز</th>
              <th style={printTh}>المقعد</th>
            </tr>
          </thead>
          <tbody>
            {(printUnit.assignments ?? []).map((a, i) => (
              <tr key={a.id}>
                <td style={printTd}>{i + 1}</td>
                <td style={printTd}>{a.traveller?.full_name_ar ?? '—'}</td>
                <td style={printTd}>{a.traveller?.passport_number ?? '—'}</td>
                <td style={printTd}>{a.seat_number ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {printUnit && (
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #umrah-transport-print, #umrah-transport-print * { visibility: visible; }
          #umrah-transport-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; }
        }
      `}</style>
    )}
    </>
  )
}

// ─── المالية ────────────────────────────────────────────────────────────────

const EMPTY_INCOME: Partial<UmrahIncome> = { amount: undefined, income_date: '', source: '', notes: '' }
const EMPTY_EXPENSE: Partial<UmrahExpense> = { amount: undefined, expense_date: '', category: 'other', description: '', notes: '' }

function FinanceTab({ tripId, trip, campaignPrintHeader }: { tripId: string; trip: UmrahTrip; campaignPrintHeader: CampaignPrintHeader }) {
  const qc = useQueryClient()
  const [incomeModal, setIncomeModal] = useState<'add' | 'edit' | null>(null)
  const [selectedIncome, setSelectedIncome] = useState<Partial<UmrahIncome>>(EMPTY_INCOME)
  const [expenseModal, setExpenseModal] = useState<'add' | 'edit' | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Partial<UmrahExpense>>(EMPTY_EXPENSE)
  const [printReport, setPrintReport] = useState(false)

  const { data: income = [], isLoading: incomeLoading } = useQuery({
    queryKey: ['umrah-income', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_income')
        .select('*')
        .eq('umrah_trip_id', tripId)
        .order('income_date', { ascending: false })
      return (data ?? []) as UmrahIncome[]
    },
  })

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['umrah-expenses', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_expenses')
        .select('*')
        .eq('umrah_trip_id', tripId)
        .order('expense_date', { ascending: false })
      return (data ?? []) as UmrahExpense[]
    },
  })

  // Shared with InvoicesTab so payment add/delete refreshes this summary
  const { data: invoices = [] } = useQuery({
    queryKey: ['umrah-invoices', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_invoices')
        .select('*, items:umrah_invoice_items(*, traveller:umrah_travellers(*)), payments:umrah_invoice_payments(*)')
        .eq('umrah_trip_id', tripId)
        .order('invoice_date', { ascending: false })
      return (data ?? []) as UmrahInvoice[]
    },
  })

  const incomeFromInvoices = invoices.reduce(
    (s, inv) => s + (inv.payments ?? []).reduce((ps, p) => ps + (Number(p.amount) || 0), 0),
    0,
  )
  const otherIncome = income.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalIncome = incomeFromInvoices + otherIncome
  const totalInvoiced = invoices.reduce((s, inv) => s + invoiceTotal(inv), 0)
  const pendingAmount = Math.max(0, totalInvoiced - incomeFromInvoices)
  const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const profit = totalIncome - totalExpenses

  const saveIncome = useMutation({
    mutationFn: async (row: Partial<UmrahIncome>) => {
      const payload = {
        amount:      row.amount == null || Number.isNaN(Number(row.amount)) ? null : Number(row.amount),
        income_date: row.income_date || null,
        source:      row.source || null,
        notes:       row.notes || null,
      }
      if (incomeModal === 'add') {
        await supabase.from('umrah_income').insert({ ...payload, umrah_trip_id: tripId }).throwOnError()
      } else {
        await supabase.from('umrah_income').update(payload).eq('id', row.id!).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-income', tripId] })
      setIncomeModal(null)
      setSelectedIncome(EMPTY_INCOME)
    },
  })

  const deleteIncome = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_income').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-income', tripId] }),
  })

  const saveExpense = useMutation({
    mutationFn: async (row: Partial<UmrahExpense>) => {
      const payload = {
        amount:       row.amount == null || Number.isNaN(Number(row.amount)) ? null : Number(row.amount),
        expense_date: row.expense_date || null,
        category:     row.category || null,
        description:  row.description || null,
        notes:        row.notes || null,
      }
      if (expenseModal === 'add') {
        await supabase.from('umrah_expenses').insert({ ...payload, umrah_trip_id: tripId }).throwOnError()
      } else {
        await supabase.from('umrah_expenses').update(payload).eq('id', row.id!).throwOnError()
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-expenses', tripId] })
      setExpenseModal(null)
      setSelectedExpense(EMPTY_EXPENSE)
    },
  })

  const deleteExpense = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_expenses').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-expenses', tripId] }),
  })

  type IncomeListRow =
    | { kind: 'manual'; id: string; date: string | null; amount: number; source: string | null; row: UmrahIncome }
    | { kind: 'payment'; id: string; date: string | null; amount: number; invoiceNumber: string | null; travellers: string }

  const incomeList: IncomeListRow[] = [
    ...income.map((row): IncomeListRow => ({
      kind: 'manual',
      id: row.id,
      date: row.income_date,
      amount: Number(row.amount) || 0,
      source: row.source,
      row,
    })),
    ...invoices.flatMap(inv =>
      (inv.payments ?? []).map((p): IncomeListRow => ({
        kind: 'payment',
        id: p.id,
        date: p.payment_date,
        amount: Number(p.amount) || 0,
        invoiceNumber: inv.invoice_number,
        travellers: [...new Set(
          (inv.items ?? [])
            .map(it => it.traveller?.full_name_ar)
            .filter((n): n is string => !!n),
        )].join('، '),
      })),
    ),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id))

  const reportDate = new Date().toISOString().slice(0, 10)
  const tripDatesLabel = [trip.departure_date, trip.return_date].filter(Boolean).join(' → ') || '—'

  useEffect(() => {
    if (!printReport) return
    const clear = () => setPrintReport(false)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [printReport])

  const handlePrintReport = () => {
    setPrintReport(true)
    setTimeout(() => window.print(), 50)
  }

  return (
    <>
    <div className="space-y-4 print:hidden">
      <div className="flex justify-end">
        <button onClick={handlePrintReport}
          className="flex items-center gap-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
          <Download size={12} /> تحميل التقرير المالي
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700" dir="ltr">{formatBhd(totalIncome)}</p>
          <p className="text-xs text-gray-500 mt-0.5">إجمالي الدخل</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
          <p className={`text-2xl font-bold ${pendingAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}`} dir="ltr">
            {formatBhd(pendingAmount)}
          </p>
          <p className="text-xs text-amber-700/70 mt-0.5">
            {pendingAmount > 0 ? 'المبالغ المستحقة' : 'تم التحصيل بالكامل'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-2xl font-bold text-gray-700" dir="ltr">{formatBhd(totalExpenses)}</p>
          <p className="text-xs text-gray-500 mt-0.5">إجمالي المصروفات</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className={`text-2xl font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">
            {formatBhd(profit)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">صافي الربح</p>
        </div>
      </div>

      {/* Income */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Wallet size={15} /> الدخل ({incomeList.length})
          </h2>
          <button onClick={() => { setSelectedIncome(EMPTY_INCOME); setIncomeModal('add') }}
            className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
            <Plus size={12} /> إضافة دخل
          </button>
        </div>

        {incomeLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {incomeList.map(entry => (
              <div key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between py-2.5 text-sm gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-gray-800" dir="ltr">{formatBhd(entry.amount)}</span>
                    {entry.kind === 'payment' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">
                        دفعة فاتورة
                      </span>
                    ) : entry.source ? (
                      <span className="text-gray-400 text-xs">{entry.source}</span>
                    ) : null}
                    {entry.date && <span className="text-gray-400 text-xs">{entry.date}</span>}
                  </div>
                  {entry.kind === 'payment' && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {entry.invoiceNumber && <span className="font-mono">{entry.invoiceNumber}</span>}
                      {entry.travellers && (
                        <span>{entry.invoiceNumber ? ' — ' : ''}{entry.travellers}</span>
                      )}
                    </p>
                  )}
                </div>
                {entry.kind === 'manual' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => { setSelectedIncome(entry.row); setIncomeModal('edit') }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => window.confirm('حذف قيد الدخل؟') && deleteIncome.mutate(entry.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {incomeList.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد قيود دخل لهذه الرحلة</p>}
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Wallet size={15} /> المصروفات ({expenses.length})
          </h2>
          <button onClick={() => { setSelectedExpense(EMPTY_EXPENSE); setExpenseModal('add') }}
            className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
            <Plus size={12} /> إضافة مصروف
          </button>
        </div>

        {expensesLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {expenses.map(row => (
              <div key={row.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-gray-800" dir="ltr">{formatBhd(Number(row.amount) || 0)}</span>
                  {row.category && (
                    <span className="text-gray-400 text-xs mr-2">
                      {EXPENSE_CATEGORY_AR[row.category] ?? row.category}
                    </span>
                  )}
                  {row.description && <span className="text-gray-400 text-xs mr-2">{row.description}</span>}
                  {row.expense_date && <span className="text-gray-400 text-xs mr-2">{row.expense_date}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectedExpense(row); setExpenseModal('edit') }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => window.confirm('حذف قيد المصروف؟') && deleteExpense.mutate(row.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {expenses.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد مصروفات لهذه الرحلة</p>}
          </div>
        )}
      </div>

      {/* Income modal */}
      {incomeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">{incomeModal === 'add' ? 'إضافة دخل' : 'تعديل الدخل'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ (BHD) *</label>
                  <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                    value={selectedIncome.amount ?? ''}
                    onChange={e => setSelectedIncome(s => ({
                      ...s,
                      amount: e.target.value === '' ? undefined : +e.target.value,
                    }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
                  <input className={ic} type="date" value={selectedIncome.income_date ?? ''}
                    onChange={e => setSelectedIncome(s => ({ ...s, income_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">المصدر</label>
                <input className={ic} value={selectedIncome.source ?? ''}
                  onChange={e => setSelectedIncome(s => ({ ...s, source: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                <textarea className={ic + ' resize-none'} rows={2} value={selectedIncome.notes ?? ''}
                  onChange={e => setSelectedIncome(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => saveIncome.mutate(selectedIncome)}
                disabled={saveIncome.isPending || selectedIncome.amount == null}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setIncomeModal(null); setSelectedIncome(EMPTY_INCOME) }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense modal */}
      {expenseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">{expenseModal === 'add' ? 'إضافة مصروف' : 'تعديل المصروف'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ (BHD) *</label>
                  <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                    value={selectedExpense.amount ?? ''}
                    onChange={e => setSelectedExpense(s => ({
                      ...s,
                      amount: e.target.value === '' ? undefined : +e.target.value,
                    }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
                  <input className={ic} type="date" value={selectedExpense.expense_date ?? ''}
                    onChange={e => setSelectedExpense(s => ({ ...s, expense_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">التصنيف</label>
                <select className={ic} value={selectedExpense.category ?? 'other'}
                  onChange={e => setSelectedExpense(s => ({ ...s, category: e.target.value as UmrahExpenseCategory }))}>
                  {Object.entries(EXPENSE_CATEGORY_AR).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الوصف</label>
                <input className={ic} value={selectedExpense.description ?? ''}
                  onChange={e => setSelectedExpense(s => ({ ...s, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                <textarea className={ic + ' resize-none'} rows={2} value={selectedExpense.notes ?? ''}
                  onChange={e => setSelectedExpense(s => ({ ...s, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => saveExpense.mutate(selectedExpense)}
                disabled={saveExpense.isPending || selectedExpense.amount == null}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setExpenseModal(null); setSelectedExpense(EMPTY_EXPENSE) }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {printReport && (
      <div id="umrah-finance-report-print" className="hidden print:block" dir="rtl">
        <PrintCampaignHeader header={campaignPrintHeader} />
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: '#000' }}>
          التقرير المالي — {trip.trip_name}
        </h1>
        <p style={{ fontSize: '13px', marginBottom: '2px', color: '#000' }}>تواريخ الرحلة: {tripDatesLabel}</p>
        <p style={{ fontSize: '13px', marginBottom: '2px', color: '#000' }}>تاريخ التقرير: {reportDate}</p>
        <hr style={{ margin: '12px 0', borderColor: '#000' }} />

        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#000' }}>الدخل</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000', marginBottom: '8px' }}>
          <thead>
            <tr>
              <th style={printTh}>التاريخ</th>
              <th style={printTh}>المصدر / رقم الفاتورة</th>
              <th style={printTh}>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {incomeList.map(entry => (
              <tr key={`r-${entry.kind}-${entry.id}`}>
                <td style={printTd}>{entry.date ?? '—'}</td>
                <td style={printTd}>
                  {entry.kind === 'payment'
                    ? `دفعة فاتورة${entry.invoiceNumber ? ` — ${entry.invoiceNumber}` : ''}${entry.travellers ? ` (${entry.travellers})` : ''}`
                    : (entry.source || 'دخل يدوي')}
                </td>
                <td style={printTd}>{entry.amount.toFixed(3)} BHD</td>
              </tr>
            ))}
            {incomeList.length === 0 && (
              <tr><td style={printTd} colSpan={3}>لا توجد قيود دخل</td></tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', color: '#000' }}>
          إجمالي الدخل: {totalIncome.toFixed(3)} BHD
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#000' }}>المصروفات</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000', marginBottom: '8px' }}>
          <thead>
            <tr>
              <th style={printTh}>التاريخ</th>
              <th style={printTh}>التصنيف</th>
              <th style={printTh}>الوصف</th>
              <th style={printTh}>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(row => (
              <tr key={`r-exp-${row.id}`}>
                <td style={printTd}>{row.expense_date ?? '—'}</td>
                <td style={printTd}>{row.category ? (EXPENSE_CATEGORY_AR[row.category] ?? row.category) : '—'}</td>
                <td style={printTd}>{row.description ?? '—'}</td>
                <td style={printTd}>{(Number(row.amount) || 0).toFixed(3)} BHD</td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr><td style={printTd} colSpan={4}>لا توجد مصروفات</td></tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', color: '#000' }}>
          إجمالي المصروفات: {totalExpenses.toFixed(3)} BHD
        </p>

        <p style={{ fontSize: '13px', marginBottom: '16px', color: '#000' }}>
          المبالغ المستحقة: {pendingAmount.toFixed(3)} BHD
        </p>

        <div style={{ border: '2px solid #000', padding: '12px', color: '#000' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>الملخص</h2>
          <p style={{ fontSize: '13px', marginBottom: '4px' }}>إجمالي الدخل: {totalIncome.toFixed(3)} BHD</p>
          <p style={{ fontSize: '13px', marginBottom: '4px' }}>إجمالي المصروفات: {totalExpenses.toFixed(3)} BHD</p>
          <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
            صافي الربح: {profit.toFixed(3)} BHD
          </p>
          <p style={{ fontSize: '13px' }}>المبالغ المستحقة: {pendingAmount.toFixed(3)} BHD</p>
        </div>
      </div>
    )}

    {printReport && (
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #umrah-finance-report-print, #umrah-finance-report-print * { visibility: visible; }
          #umrah-finance-report-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; }
        }
      `}</style>
    )}
    </>
  )
}

// ─── التسعير ────────────────────────────────────────────────────────────────

type PricingExpenseRule = UmrahPricingExpenseRule
type SplitRoomKey = 'quad' | 'triple' | 'double' | 'single'

type PricingExpenseDraft = {
  id: string
  name: string
  amount: number | undefined
  amount_quad: number | undefined
  amount_triple: number | undefined
  amount_double: number | undefined
  amount_single: number | undefined
  rule: PricingExpenseRule
}

type PricingInputs = {
  total_travellers:  number | undefined
  margin_quad:       number | undefined
  margin_triple:     number | undefined
  margin_double:     number | undefined
  margin_single:     number | undefined
  infant_price:      number | undefined
  leader_count:      number | undefined
  leader_flight:     number | undefined
  leader_cash:       number | undefined
  notes:             string
}

const PRICING_OCCUPANCY = { quad: 4, triple: 3, double: 2, single: 1 } as const

const RULE_AR: Record<PricingExpenseRule, string> = {
  per_person:           'لكل شخص',
  split_by_room:        'يقسم على الغرفة',
  split_by_travellers:  'يقسم على عدد المسافرين',
  leader:               'قائد الرحلة',
}

const SPLIT_ROOM_FIELDS: { key: keyof Pick<PricingExpenseDraft, 'amount_quad' | 'amount_triple' | 'amount_double' | 'amount_single'>; label: string }[] = [
  { key: 'amount_quad',   label: 'رباعية' },
  { key: 'amount_triple', label: 'ثلاثية' },
  { key: 'amount_double', label: 'ثنائية' },
  { key: 'amount_single', label: 'فردية' },
]

function emptyExpenseDraft(partial: Partial<PricingExpenseDraft> = {}): PricingExpenseDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    amount: undefined,
    amount_quad: undefined,
    amount_triple: undefined,
    amount_double: undefined,
    amount_single: undefined,
    rule: 'per_person',
    ...partial,
  }
}

const DEFAULT_PRICING_EXPENSES: Pick<PricingExpenseDraft, 'name' | 'rule'>[] = [
  { name: 'Flight',    rule: 'per_person' },
  { name: 'Hotel MD',  rule: 'split_by_room' },
  { name: 'Hotel MK',  rule: 'split_by_room' },
  { name: 'Transport', rule: 'split_by_travellers' },
  { name: 'Leader',    rule: 'leader' },
]

const EMPTY_PRICING_INPUTS: PricingInputs = {
  total_travellers: undefined,
  margin_quad: undefined,
  margin_triple: undefined,
  margin_double: undefined,
  margin_single: undefined,
  infant_price: 50,
  leader_count: 2,
  leader_flight: undefined,
  leader_cash: undefined,
  notes: '',
}

const MARGIN_FIELDS: { key: keyof Pick<PricingInputs, 'margin_quad' | 'margin_triple' | 'margin_double' | 'margin_single'>; label: string }[] = [
  { key: 'margin_quad',   label: 'هامش الربح - رباعية' },
  { key: 'margin_triple', label: 'هامش - ثلاثية' },
  { key: 'margin_double', label: 'هامش - ثنائية' },
  { key: 'margin_single', label: 'هامش - فردية' },
]

const CALCULATED_PRICE_ROWS: {
  key: 'quad' | 'triple' | 'double' | 'single' | 'child' | 'infant'
  label: string
  occupancy: number | null
}[] = [
  { key: 'quad',   label: 'رباعية', occupancy: 4 },
  { key: 'triple', label: 'ثلاثية', occupancy: 3 },
  { key: 'double', label: 'ثنائية', occupancy: 2 },
  { key: 'single', label: 'فردية', occupancy: 1 },
  { key: 'child',  label: 'طفل',    occupancy: 2 },
  { key: 'infant', label: 'رضيع',   occupancy: null },
]

function seedPricingExpenses(): PricingExpenseDraft[] {
  return DEFAULT_PRICING_EXPENSES.map(e => emptyExpenseDraft(e))
}

function calcAutoLeaderHotel(expenses: PricingExpenseDraft[]): number {
  let sum = 0
  for (const e of expenses) {
    if (e.rule === 'split_by_room') sum += numOrZero(e.amount_quad) / PRICING_OCCUPANCY.quad
  }
  return round3(sum)
}

function calcLeaderShare(
  leaderCount: number,
  flight: number,
  hotel: number,
  cash: number,
  totalTravellers: number,
): number {
  if (totalTravellers <= 0) return 0
  return (leaderCount * (flight + hotel + cash)) / totalTravellers
}

function splitByRoomAmount(e: PricingExpenseDraft, room: SplitRoomKey): number {
  if (room === 'quad') return numOrZero(e.amount_quad)
  if (room === 'triple') return numOrZero(e.amount_triple)
  if (room === 'double') return numOrZero(e.amount_double)
  return numOrZero(e.amount_single)
}

function marginForRoom(inputs: PricingInputs, room: SplitRoomKey): number {
  if (room === 'quad') return numOrZero(inputs.margin_quad)
  if (room === 'triple') return numOrZero(inputs.margin_triple)
  if (room === 'double') return numOrZero(inputs.margin_double)
  return numOrZero(inputs.margin_single)
}

function calcRoomPrice(
  room: SplitRoomKey,
  expenses: PricingExpenseDraft[],
  totalTravellers: number,
  margin: number,
  leaderShare: number,
): number {
  const occupancy = PRICING_OCCUPANCY[room]
  let sum = 0
  for (const e of expenses) {
    if (e.rule === 'per_person') sum += numOrZero(e.amount)
    else if (e.rule === 'split_by_room') sum += splitByRoomAmount(e, room) / occupancy
    else if (e.rule === 'split_by_travellers') {
      if (totalTravellers > 0) sum += numOrZero(e.amount) / totalTravellers
    }
  }
  return round3(sum + leaderShare + margin)
}

function calcPricing(
  expenses: PricingExpenseDraft[],
  inputs: PricingInputs,
): {
  price_quad: number
  price_triple: number
  price_double: number
  price_single: number
  price_child: number
  price_infant: number
  leaderShare: number
  autoLeaderHotel: number
  travellersMissing: boolean
} {
  const totalTravellers = numOrZero(inputs.total_travellers)
  const autoLeaderHotel = calcAutoLeaderHotel(expenses)
  const leaderShare = calcLeaderShare(
    numOrZero(inputs.leader_count),
    numOrZero(inputs.leader_flight),
    autoLeaderHotel,
    numOrZero(inputs.leader_cash),
    totalTravellers,
  )
  const adult = (room: SplitRoomKey) =>
    calcRoomPrice(room, expenses, totalTravellers, marginForRoom(inputs, room), leaderShare)
  return {
    price_quad:   adult('quad'),
    price_triple: adult('triple'),
    price_double: adult('double'),
    price_single: adult('single'),
    price_child:  adult('double'),
    price_infant: round3(numOrZero(inputs.infant_price)),
    leaderShare:  round3(leaderShare),
    autoLeaderHotel,
    travellersMissing: totalTravellers <= 0,
  }
}

function PricingTab({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<PricingInputs>(EMPTY_PRICING_INPUTS)
  const [expenseRows, setExpenseRows] = useState<PricingExpenseDraft[]>([])
  const loadedIdsRef = useRef<string[]>([])
  const hydratedRef = useRef(false)

  const { data: pricing, isLoading: pricingLoading } = useQuery({
    queryKey: ['umrah-trip-pricing', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_trip_pricing')
        .select('*')
        .eq('umrah_trip_id', tripId)
        .maybeSingle()
      return (data ?? null) as UmrahTripPricing | null
    },
  })

  const { data: dbExpenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['umrah-pricing-expenses', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_pricing_expenses')
        .select('*')
        .eq('umrah_trip_id', tripId)
        .order('sort_order', { ascending: true })
      return (data ?? []) as UmrahPricingExpense[]
    },
  })

  useEffect(() => {
    hydratedRef.current = false
  }, [tripId])

  useEffect(() => {
    if (pricingLoading || expensesLoading) return
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (pricing) {
      setForm({
        total_travellers:  pricing.total_travellers ?? undefined,
        margin_quad:       pricing.margin_quad ?? undefined,
        margin_triple:     pricing.margin_triple ?? undefined,
        margin_double:     pricing.margin_double ?? undefined,
        margin_single:     pricing.margin_single ?? undefined,
        infant_price:      pricing.infant_price ?? 50,
        leader_count:      pricing.leader_count ?? 2,
        leader_flight:     pricing.leader_flight ?? undefined,
        leader_cash:       pricing.leader_cash ?? undefined,
        notes:             pricing.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY_PRICING_INPUTS })
    }
    if (dbExpenses && dbExpenses.length > 0) {
      loadedIdsRef.current = dbExpenses.map(e => e.id)
      setExpenseRows(dbExpenses.map(e => ({
        id: e.id,
        name: e.name ?? '',
        amount: e.amount == null ? undefined : Number(e.amount),
        amount_quad: e.amount_quad == null ? undefined : Number(e.amount_quad),
        amount_triple: e.amount_triple == null ? undefined : Number(e.amount_triple),
        amount_double: e.amount_double == null ? undefined : Number(e.amount_double),
        amount_single: e.amount_single == null ? undefined : Number(e.amount_single),
        rule: e.rule,
      })))
    } else if (!pricing) {
      loadedIdsRef.current = []
      setExpenseRows(seedPricingExpenses())
    } else {
      loadedIdsRef.current = []
      setExpenseRows([])
    }
  }, [pricing, dbExpenses, pricingLoading, expensesLoading])

  const result = useMemo(() => calcPricing(expenseRows, form), [expenseRows, form])

  const updateExpense = (id: string, patch: Partial<PricingExpenseDraft>) => {
    setExpenseRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const save = useMutation({
    mutationFn: async () => {
      const prices = calcPricing(expenseRows, form)
      const keepIds = expenseRows.map(r => r.id)
      const toDelete = loadedIdsRef.current.filter(id => !keepIds.includes(id))
      if (toDelete.length > 0) {
        await supabase.from('umrah_pricing_expenses').delete().in('id', toDelete).throwOnError()
      }
      if (expenseRows.length > 0) {
        await supabase.from('umrah_pricing_expenses').upsert(
          expenseRows.map((r, i) => ({
            id: r.id,
            umrah_trip_id: tripId,
            name: r.name.trim() || null,
            amount: nullNum(r.amount) ?? 0,
            amount_quad: nullNum(r.amount_quad) ?? 0,
            amount_triple: nullNum(r.amount_triple) ?? 0,
            amount_double: nullNum(r.amount_double) ?? 0,
            amount_single: nullNum(r.amount_single) ?? 0,
            rule: r.rule,
            sort_order: i,
          })),
        ).throwOnError()
      }
      await supabase.from('umrah_trip_pricing').upsert({
        umrah_trip_id:     tripId,
        total_travellers:  nullNum(form.total_travellers) ?? 0,
        margin_quad:       nullNum(form.margin_quad) ?? 0,
        margin_triple:     nullNum(form.margin_triple) ?? 0,
        margin_double:     nullNum(form.margin_double) ?? 0,
        margin_single:     nullNum(form.margin_single) ?? 0,
        infant_price:      nullNum(form.infant_price) ?? 0,
        leader_count:      nullNum(form.leader_count) ?? 0,
        leader_flight:     nullNum(form.leader_flight) ?? 0,
        leader_hotel:      prices.autoLeaderHotel,
        leader_cash:       nullNum(form.leader_cash) ?? 0,
        notes:             form.notes.trim() || null,
        price_quad:        prices.price_quad,
        price_triple:      prices.price_triple,
        price_double:      prices.price_double,
        price_single:      prices.price_single,
        price_child:       prices.price_child,
        price_infant:      prices.price_infant,
      }, { onConflict: 'umrah_trip_id' }).throwOnError()
      loadedIdsRef.current = keepIds
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-trip-pricing', tripId] })
      qc.invalidateQueries({ queryKey: ['umrah-pricing-expenses', tripId] })
    },
  })

  const isLoading = pricingLoading || expensesLoading

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Tag size={15} /> مصروفات التسعير
          </h2>
          <button type="button"
            onClick={() => setExpenseRows(rows => [...rows, emptyExpenseDraft()])}
            className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
            <Plus size={12} /> إضافة مصروف
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {expenseRows.map(row => (
            <div key={row.id} className="py-2.5 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input className={ic + ' flex-1'} placeholder="الاسم" value={row.name}
                  onChange={e => updateExpense(row.id, { name: e.target.value })} />
                {row.rule !== 'split_by_room' && (
                  <input className={ic + ' sm:w-28'} type="number" step="0.001" dir="ltr" placeholder="المبلغ"
                    value={row.amount ?? ''}
                    onChange={e => updateExpense(row.id, { amount: parseInputNum(e.target.value) })} />
                )}
                <select className={ic + ' sm:w-52'} value={row.rule}
                  onChange={e => updateExpense(row.id, { rule: e.target.value as PricingExpenseRule })}>
                  {(Object.keys(RULE_AR) as PricingExpenseRule[]).map(k => (
                    <option key={k} value={k}>{RULE_AR[k]}</option>
                  ))}
                </select>
                <button type="button" aria-label="حذف المصروف"
                  onClick={() => setExpenseRows(rows => rows.filter(r => r.id !== row.id))}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg self-end sm:self-auto shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              {row.rule === 'split_by_room' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SPLIT_ROOM_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
                      <input className={ic} type="number" step="0.001" dir="ltr" placeholder="0"
                        value={row[key] ?? ''}
                        onChange={e => updateExpense(row.id, { [key]: parseInputNum(e.target.value) })} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {expenseRows.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">لا توجد مصروفات — أضف بنداً أو احفظ القائمة الفارغة</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
          <Users size={15} /> مدخلات الرحلة
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">إجمالي المسافرين</label>
              <input className={ic} type="number" min="0" step="1" dir="ltr"
                value={form.total_travellers ?? ''}
                onChange={e => setForm(f => ({ ...f, total_travellers: parseInputNum(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">سعر الرضيع (BHD)</label>
              <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                value={form.infant_price ?? ''}
                onChange={e => setForm(f => ({ ...f, infant_price: parseInputNum(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">عدد القادة</label>
              <input className={ic} type="number" min="0" step="1" dir="ltr"
                value={form.leader_count ?? ''}
                onChange={e => setForm(f => ({ ...f, leader_count: parseInputNum(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MARGIN_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input className={ic} type="number" step="0.001" dir="ltr"
                  value={form[key] ?? ''}
                  onChange={e => setForm(f => ({ ...f, [key]: parseInputNum(e.target.value) }))} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">تذكرة القائد (BHD)</label>
              <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                value={form.leader_flight ?? ''}
                onChange={e => setForm(f => ({ ...f, leader_flight: parseInputNum(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">فندق القائد (محسوب)</label>
              <div className={ic + ' bg-gray-50 text-gray-700'} dir="ltr">
                {formatBhd(result.autoLeaderHotel)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نقدية القائد (BHD)</label>
              <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                value={form.leader_cash ?? ''}
                onChange={e => setForm(f => ({ ...f, leader_cash: parseInputNum(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
            <textarea className={ic + ' resize-none'} rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-4">
          <Tag size={15} /> الأسعار المحسوبة
        </h2>

        {result.travellersMissing && (
          <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 px-3 py-2 rounded-lg mb-3">
            <AlertTriangle size={14} className="shrink-0" />
            يُحتاج إجمالي المسافرين لتسعير دقيق. تقسيم النقل وحصة القائد تُعامل حالياً كصفر.
          </div>
        )}

        <div className="divide-y divide-gray-50 mb-3">
          {CALCULATED_PRICE_ROWS.map(row => (
            <div key={row.key} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <span className="font-medium text-gray-800">{row.label}</span>
                {row.occupancy != null && (
                  <span className="text-gray-400 text-xs mr-2">إشغال {row.occupancy}</span>
                )}
              </div>
              <span className="font-semibold text-emerald-700" dir="ltr">
                {formatBhd(result[INVOICE_PRICE_KEY[row.key]])}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          حصة القائد للفرد: <span dir="ltr">{formatBhd(result.leaderShare)}</span>
        </p>

        {save.isError && (
          <p className="text-xs text-red-600 text-center mb-2">فشل حفظ التسعير</p>
        )}
        <button type="button" onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
          {save.isPending ? 'جارٍ الحفظ...' : 'حفظ التسعير'}
        </button>
      </div>
    </div>
  )
}

// ─── الفواتير ───────────────────────────────────────────────────────────────

type InvoiceLineDraft = {
  key: string
  umrah_traveller_id: string
  room_type: UmrahInvoiceRoomType | ''
  price: number | undefined
}

type InvoiceForm = {
  id?: string
  invoice_date: string
  discount: number | undefined
  notes: string
  lines: InvoiceLineDraft[]
}

function newLine(): InvoiceLineDraft {
  return { key: crypto.randomUUID(), umrah_traveller_id: '', room_type: '', price: undefined }
}

const EMPTY_INVOICE_FORM: InvoiceForm = {
  invoice_date: new Date().toISOString().slice(0, 10),
  discount: undefined,
  notes: '',
  lines: [newLine()],
}

function invoiceSubtotal(inv: UmrahInvoice) {
  return (inv.items ?? []).reduce((s, it) => s + (Number(it.price) || 0), 0)
}

function invoiceTotal(inv: UmrahInvoice) {
  return Math.max(0, invoiceSubtotal(inv) - (Number(inv.discount) || 0))
}

function invoicePaid(inv: UmrahInvoice) {
  return (inv.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
}

function invoiceStatus(inv: UmrahInvoice): { label: string; cls: string } {
  const total = invoiceTotal(inv)
  const paid = invoicePaid(inv)
  if (total > 0 && paid >= total) return { label: 'مدفوعة بالكامل', cls: 'bg-emerald-50 text-emerald-700' }
  if (paid > 0) return { label: 'مدفوعة جزئياً', cls: 'bg-amber-50 text-amber-700' }
  return { label: 'غير مدفوعة', cls: 'bg-gray-100 text-gray-600' }
}

function InvoicesTab({ tripId, tripName, enrolled, campaignPrintHeader }: { tripId: string; tripName: string; enrolled: UmrahTravellerTrip[]; campaignPrintHeader: CampaignPrintHeader }) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [form, setForm] = useState<InvoiceForm>(EMPTY_INVOICE_FORM)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [printInv, setPrintInv] = useState<UmrahInvoice | null>(null)
  const [payDraft, setPayDraft] = useState<{ amount: number | undefined; payment_date: string; notes: string }>({
    amount: undefined,
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [showPayForm, setShowPayForm] = useState(false)

  const roster = enrolled.map(e => e.traveller).filter(Boolean) as UmrahTraveller[]

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['umrah-invoices', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_invoices')
        .select('*, items:umrah_invoice_items(*, traveller:umrah_travellers(*)), payments:umrah_invoice_payments(*)')
        .eq('umrah_trip_id', tripId)
        .order('invoice_date', { ascending: false })
      return (data ?? []) as UmrahInvoice[]
    },
  })

  const { data: pricing } = useQuery({
    queryKey: ['umrah-trip-pricing', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_trip_pricing')
        .select('*')
        .eq('umrah_trip_id', tripId)
        .maybeSingle()
      return (data ?? null) as UmrahTripPricing | null
    },
  })

  const priceForType = (roomType: UmrahInvoiceRoomType): number | undefined => {
    if (!pricing) return undefined
    const v = pricing[INVOICE_PRICE_KEY[roomType]]
    return v == null ? undefined : Number(v)
  }

  const draftSubtotal = form.lines.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const draftDiscount = Number(form.discount) || 0
  const draftTotal = Math.max(0, draftSubtotal - draftDiscount)

  const openAdd = () => {
    setForm({ ...EMPTY_INVOICE_FORM, invoice_date: new Date().toISOString().slice(0, 10), lines: [newLine()] })
    setModal('add')
  }

  const openEdit = (inv: UmrahInvoice) => {
    setForm({
      id: inv.id,
      invoice_date: inv.invoice_date ?? '',
      discount: inv.discount == null ? undefined : Number(inv.discount),
      notes: inv.notes ?? '',
      lines: (inv.items ?? []).length
        ? (inv.items ?? []).map(it => ({
            key: it.id,
            umrah_traveller_id: it.umrah_traveller_id ?? '',
            room_type: (it.room_type ?? '') as UmrahInvoiceRoomType | '',
            price: it.price == null ? undefined : Number(it.price),
          }))
        : [newLine()],
    })
    setModal('edit')
  }

  const saveInvoice = useMutation({
    mutationFn: async () => {
      const invoicePayload = {
        invoice_date: form.invoice_date || null,
        discount: nullNum(form.discount),
        notes: form.notes || null,
      }
      const itemRows = form.lines
        .filter(l => l.umrah_traveller_id)
        .map(l => ({
          umrah_traveller_id: l.umrah_traveller_id || null,
          room_type: l.room_type || null,
          price: nullNum(l.price),
        }))

      if (modal === 'add') {
        const { data: inv } = await supabase
          .from('umrah_invoices')
          .insert({ ...invoicePayload, umrah_trip_id: tripId })
          .select('id')
          .single()
          .throwOnError()
        if (itemRows.length) {
          await supabase
            .from('umrah_invoice_items')
            .insert(itemRows.map(r => ({ ...r, umrah_invoice_id: inv!.id })))
            .throwOnError()
        }
      } else {
        await supabase.from('umrah_invoices').update(invoicePayload).eq('id', form.id!).throwOnError()
        await supabase.from('umrah_invoice_items').delete().eq('umrah_invoice_id', form.id!).throwOnError()
        if (itemRows.length) {
          await supabase
            .from('umrah_invoice_items')
            .insert(itemRows.map(r => ({ ...r, umrah_invoice_id: form.id! })))
            .throwOnError()
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-invoices', tripId] })
      setModal(null)
    },
  })

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('umrah_invoice_payments').delete().eq('umrah_invoice_id', id).throwOnError()
      await supabase.from('umrah_invoice_items').delete().eq('umrah_invoice_id', id).throwOnError()
      await supabase.from('umrah_invoices').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-invoices', tripId] })
      if (expandedId) setExpandedId(null)
    },
  })

  const addPayment = useMutation({
    mutationFn: async (invoiceId: string) => {
      await supabase.from('umrah_invoice_payments').insert({
        umrah_invoice_id: invoiceId,
        amount: nullNum(payDraft.amount),
        payment_date: payDraft.payment_date || null,
        notes: payDraft.notes || null,
      }).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umrah-invoices', tripId] })
      setPayDraft({ amount: undefined, payment_date: new Date().toISOString().slice(0, 10), notes: '' })
      setShowPayForm(false)
    },
  })

  const deletePayment = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_invoice_payments').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-invoices', tripId] }),
  })

  const handlePrint = (inv: UmrahInvoice) => {
    setPrintInv(inv)
    setTimeout(() => window.print(), 50)
  }

  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map(l => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (patch.room_type && patch.room_type !== '') {
          const auto = priceForType(patch.room_type)
          if (auto != null) next.price = auto
        }
        return next
      }),
    }))
  }

  return (
    <>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <FileText size={15} /> الفواتير ({invoices.length})
        </h2>
        <button onClick={openAdd}
          className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
          <Plus size={12} /> فاتورة جديدة
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {invoices.map(inv => {
            const total = invoiceTotal(inv)
            const paid = invoicePaid(inv)
            const status = invoiceStatus(inv)
            const expanded = expandedId === inv.id
            return (
              <div key={inv.id} className="py-2.5">
                <div className="flex items-center justify-between text-sm gap-2">
                  <button type="button" onClick={() => { setExpandedId(expanded ? null : inv.id); setShowPayForm(false) }}
                    className="flex items-center gap-2 text-right min-w-0 flex-1 hover:bg-gray-50 rounded-lg px-1 py-1">
                    {expanded ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800 font-mono">{inv.invoice_number ?? '—'}</span>
                      {inv.invoice_date && <span className="text-gray-400 text-xs mr-2">{inv.invoice_date}</span>}
                      <span className="text-gray-500 text-xs mr-2" dir="ltr">{formatBhd(total)}</span>
                      <span className="text-gray-400 text-xs mr-2" dir="ltr">مدفوع: {formatBhd(paid)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handlePrint(inv)} title="طباعة الفاتورة"
                      className="p-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg">
                      <Printer size={14} />
                    </button>
                    <button onClick={() => openEdit(inv)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => window.confirm('حذف الفاتورة؟') && deleteInvoice.mutate(inv.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 mr-6 space-y-3 bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-500 space-y-1">
                      {(inv.items ?? []).map(it => (
                        <div key={it.id} className="flex justify-between gap-2">
                          <span>{it.traveller?.full_name_ar ?? '—'}
                            {it.room_type && <span className="text-gray-400 mr-1">({INVOICE_ROOM_TYPE_AR[it.room_type] ?? it.room_type})</span>}
                          </span>
                          <span dir="ltr">{formatBhd(Number(it.price) || 0)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-gray-200 pt-1 font-medium text-gray-700">
                        <span>الإجمالي بعد الخصم</span>
                        <span dir="ltr">{formatBhd(total)}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-600">المدفوعات</h3>
                        <button onClick={() => setShowPayForm(!showPayForm)}
                          className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg">
                          <Plus size={11} /> إضافة دفعة
                        </button>
                      </div>
                      <div className="divide-y divide-gray-200/60">
                        {(inv.payments ?? []).map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                            <div>
                              <span className="font-medium text-gray-800" dir="ltr">{formatBhd(Number(p.amount) || 0)}</span>
                              {p.payment_date && <span className="text-gray-400 mr-2">{p.payment_date}</span>}
                              {p.notes && <span className="text-gray-400 mr-2">{p.notes}</span>}
                            </div>
                            <button onClick={() => window.confirm('حذف الدفعة؟') && deletePayment.mutate(p.id)}
                              className="text-gray-300 hover:text-red-500 p-1">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        {(inv.payments ?? []).length === 0 && (
                          <p className="text-xs text-gray-400 py-2 text-center">لا توجد مدفوعات</p>
                        )}
                      </div>
                      {showPayForm && (
                        <div className="mt-2 space-y-2 bg-white rounded-lg p-3 border border-gray-100">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ *</label>
                              <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                                value={payDraft.amount ?? ''}
                                onChange={e => setPayDraft(d => ({
                                  ...d,
                                  amount: e.target.value === '' ? undefined : +e.target.value,
                                }))} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">التاريخ</label>
                              <input className={ic} type="date" value={payDraft.payment_date}
                                onChange={e => setPayDraft(d => ({ ...d, payment_date: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                            <input className={ic} value={payDraft.notes}
                              onChange={e => setPayDraft(d => ({ ...d, notes: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => addPayment.mutate(inv.id)}
                              disabled={addPayment.isPending || payDraft.amount == null}
                              className="flex-1 bg-emerald-700 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-50">
                              حفظ الدفعة
                            </button>
                            <button onClick={() => setShowPayForm(false)}
                              className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-xs">
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {invoices.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا توجد فواتير لهذه الرحلة</p>}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <h2 className="text-lg font-bold">{modal === 'add' ? 'فاتورة جديدة' : 'تعديل الفاتورة'}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ الفاتورة</label>
                <input className={ic} type="date" value={form.invoice_date}
                  onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">الخصم (BHD)</label>
                <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                  value={form.discount ?? ''}
                  onChange={e => setForm(f => ({
                    ...f,
                    discount: e.target.value === '' ? undefined : +e.target.value,
                  }))} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">بنود المسافرين</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, newLine()] }))}
                  className="flex items-center gap-1 text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg">
                  <Plus size={11} /> إضافة مسافر
                </button>
              </div>
              {form.lines.map(line => (
                <div key={line.key} className="grid grid-cols-12 gap-2 items-end bg-gray-50 rounded-xl p-2">
                  <div className="col-span-5">
                    <label className="block text-[10px] text-gray-500 mb-0.5">المسافر</label>
                    <select className={ic} value={line.umrah_traveller_id}
                      onChange={e => updateLine(line.key, { umrah_traveller_id: e.target.value })}>
                      <option value="">اختر...</option>
                      {roster.map(t => (
                        <option key={t.id} value={t.id}>{t.full_name_ar}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-gray-500 mb-0.5">نوع الغرفة</label>
                    <select className={ic} value={line.room_type}
                      onChange={e => updateLine(line.key, { room_type: e.target.value as UmrahInvoiceRoomType | '' })}>
                      <option value="">—</option>
                      {(Object.keys(INVOICE_ROOM_TYPE_AR) as UmrahInvoiceRoomType[]).map(k => (
                        <option key={k} value={k}>{INVOICE_ROOM_TYPE_AR[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-gray-500 mb-0.5">السعر</label>
                    <input className={ic} type="number" step="0.001" min="0" dir="ltr"
                      value={line.price ?? ''}
                      onChange={e => updateLine(line.key, {
                        price: e.target.value === '' ? undefined : +e.target.value,
                      })} />
                  </div>
                  <div className="col-span-1 flex justify-center pb-2">
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, lines: f.lines.filter(l => l.key !== line.key) }))}
                      disabled={form.lines.length <= 1}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-30">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <textarea className={ic + ' resize-none'} rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>المجموع الفرعي</span>
                <span dir="ltr">{formatBhd(draftSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>الخصم</span>
                <span dir="ltr">{formatBhd(draftDiscount)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1">
                <span>الإجمالي</span>
                <span dir="ltr">{formatBhd(draftTotal)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => saveInvoice.mutate()}
                disabled={saveInvoice.isPending || !form.lines.some(l => l.umrah_traveller_id)}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Print-only invoice */}
    {printInv && (
      <div id="umrah-invoice-print" className="hidden print:block" dir="rtl">
        <PrintCampaignHeader header={campaignPrintHeader} />
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>فاتورة</h1>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>رقم الفاتورة: {printInv.invoice_number ?? '—'}</p>
        <p style={{ fontSize: '13px', marginBottom: '4px' }}>التاريخ: {printInv.invoice_date ?? '—'}</p>
        <p style={{ fontSize: '13px', marginBottom: '16px' }}>الرحلة: {tripName}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000' }}>
          <thead>
            <tr>
              <th style={printTh}>#</th>
              <th style={printTh}>المسافر</th>
              <th style={printTh}>نوع الغرفة</th>
              <th style={printTh}>السعر</th>
            </tr>
          </thead>
          <tbody>
            {(printInv.items ?? []).map((it, i) => (
              <tr key={it.id}>
                <td style={printTd}>{i + 1}</td>
                <td style={printTd}>{it.traveller?.full_name_ar ?? '—'}</td>
                <td style={printTd}>{it.room_type ? (INVOICE_ROOM_TYPE_AR[it.room_type] ?? it.room_type) : '—'}</td>
                <td style={printTd}>{(Number(it.price) || 0).toFixed(3)} BHD</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '16px', fontSize: '13px', color: '#000' }}>
          <p>المجموع الفرعي: {invoiceSubtotal(printInv).toFixed(3)} BHD</p>
          <p>الخصم: {(Number(printInv.discount) || 0).toFixed(3)} BHD</p>
          <p style={{ fontWeight: 700 }}>الإجمالي: {invoiceTotal(printInv).toFixed(3)} BHD</p>
          <p>المدفوع: {invoicePaid(printInv).toFixed(3)} BHD</p>
          <p>المتبقي: {Math.max(0, invoiceTotal(printInv) - invoicePaid(printInv)).toFixed(3)} BHD</p>
        </div>
      </div>
    )}

    {printInv && (
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #umrah-invoice-print, #umrah-invoice-print * { visibility: visible; }
          #umrah-invoice-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; }
        }
      `}</style>
    )}
    </>
  )
}

// ─── المنافيست ──────────────────────────────────────────────────────────────

type ManifestDraft = { seat_number: string; passport_number: string; notes: string }
const EMPTY_MANIFEST_DRAFT: ManifestDraft = { seat_number: '', passport_number: '', notes: '' }

type ManifestColumnKey =
  | 'full_name_ar'
  | 'full_name_en'
  | 'passport_number'
  | 'nationality'
  | 'gender'
  | 'phone'
  | 'cpr_number'
  | 'date_of_birth'
  | 'seat_number'
  | 'notes'

const MANIFEST_COLUMNS: { key: ManifestColumnKey; label: string }[] = [
  { key: 'full_name_ar',     label: 'الاسم بالعربي' },
  { key: 'full_name_en',     label: 'الاسم بالإنجليزي' },
  { key: 'passport_number',  label: 'رقم الجواز' },
  { key: 'nationality',      label: 'الجنسية' },
  { key: 'gender',           label: 'الجنس' },
  { key: 'phone',            label: 'الهاتف' },
  { key: 'cpr_number',       label: 'الرقم الشخصي' },
  { key: 'date_of_birth',    label: 'تاريخ الميلاد' },
  { key: 'seat_number',      label: 'رقم المقعد' },
  { key: 'notes',            label: 'ملاحظات' },
]

const DEFAULT_MANIFEST_COLUMNS: Record<ManifestColumnKey, boolean> = {
  full_name_ar: true,
  full_name_en: false,
  passport_number: true,
  nationality: true,
  gender: false,
  phone: false,
  cpr_number: false,
  date_of_birth: false,
  seat_number: true,
  notes: false,
}

function manifestGenderLabel(g: Gender | null | undefined) {
  if (g === 'male') return 'ذكر'
  if (g === 'female') return 'أنثى'
  return '—'
}

function manifestCell(m: UmrahManifestEntry, key: ManifestColumnKey): string {
  const t = m.traveller
  if (key === 'full_name_ar') return t?.full_name_ar || '—'
  if (key === 'full_name_en') return t?.full_name_en || '—'
  if (key === 'passport_number') return m.passport_number || t?.passport_number || '—'
  if (key === 'nationality') return t?.nationality || '—'
  if (key === 'gender') return manifestGenderLabel(t?.gender)
  if (key === 'phone') return t?.phone || '—'
  if (key === 'cpr_number') return t?.cpr_number || '—'
  if (key === 'date_of_birth') return t?.date_of_birth || '—'
  if (key === 'seat_number') return m.seat_number || '—'
  return m.notes || t?.notes || ''
}

function ManifestTab({ tripId, tripName, campaignPrintHeader }: { tripId: string; tripName: string; campaignPrintHeader: CampaignPrintHeader }) {
  const qc = useQueryClient()
  const [travellerSearch, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickedTraveller, setPickedTraveller] = useState<UmrahTraveller | null>(null)
  const [draft, setDraft] = useState<ManifestDraft>(EMPTY_MANIFEST_DRAFT)
  const [editing, setEditing] = useState<UmrahManifestEntry | null>(null)
  const [printFilter, setPrintFilter] = useState<'all' | 'bahraini' | 'non-bahraini' | null>(null)
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<Record<ManifestColumnKey, boolean>>(DEFAULT_MANIFEST_COLUMNS)

  const { data: manifest = [], isLoading } = useQuery({
    queryKey: ['umrah-manifest', tripId],
    queryFn: async () => {
      const { data } = await supabase
        .from('umrah_manifest')
        .select('*, traveller:umrah_travellers(*)')
        .eq('umrah_trip_id', tripId)
      return (data ?? []) as UmrahManifestEntry[]
    },
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['umrah-travellers-search-manifest', travellerSearch],
    queryFn: async () => {
      let q = supabase.from('umrah_travellers').select('*').order('full_name_ar')
      if (travellerSearch) q = q.ilike('full_name_ar', `%${travellerSearch}%`)
      const { data } = await q.limit(10)
      return (data ?? []) as UmrahTraveller[]
    },
    enabled: showPicker,
  })

  const manifestTravellerIds = manifest.map(m => m.umrah_traveller_id)

  const isBahraini = (m: UmrahManifestEntry) =>
    (m.traveller?.nationality ?? '').trim() === 'بحريني'

  const bahrainiManifest = manifest.filter(isBahraini)
  const nonBahrainiManifest = manifest.filter(m => !isBahraini(m))

  const printRows =
    printFilter === 'bahraini' ? bahrainiManifest
    : printFilter === 'non-bahraini' ? nonBahrainiManifest
    : manifest

  const printSubtitle =
    printFilter === 'bahraini' ? 'منافيست الرحلة (بحريني)'
    : printFilter === 'non-bahraini' ? 'منافيست الرحلة (غير بحريني)'
    : 'منافيست الرحلة'

  useEffect(() => {
    if (!printFilter) return
    const clear = () => setPrintFilter(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [printFilter])

  const handlePrint = (filter: 'all' | 'bahraini' | 'non-bahraini') => {
    setPrintFilter(filter)
    setTimeout(() => window.print(), 50)
  }

  const resetAddFlow = () => {
    setShowPicker(false)
    setPickedTraveller(null)
    setDraft(EMPTY_MANIFEST_DRAFT)
    setSearch('')
  }

  const addEntry = useMutation({
    mutationFn: () =>
      supabase.from('umrah_manifest').insert({
        umrah_trip_id: tripId,
        umrah_traveller_id: pickedTraveller!.id,
        seat_number: draft.seat_number || null,
        passport_number: draft.passport_number || null,
        notes: draft.notes || null,
      }).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['umrah-manifest', tripId] }); resetAddFlow() },
  })

  const updateEntry = useMutation({
    mutationFn: (e: UmrahManifestEntry) =>
      supabase.from('umrah_manifest').update({
        seat_number: e.seat_number,
        passport_number: e.passport_number,
        notes: e.notes,
      }).eq('id', e.id).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['umrah-manifest', tripId] }); setEditing(null) },
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => supabase.from('umrah_manifest').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umrah-manifest', tripId] }),
  })

  const printBtnCls = 'flex items-center gap-1 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-40'
  const visibleColumns = MANIFEST_COLUMNS.filter(c => selectedColumns[c.key])

  return (
    <>
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:hidden">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ClipboardList size={15} /> المنافيست ({manifest.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button type="button" onClick={() => setShowColumnPicker(v => !v)} className={printBtnCls}>
              <Columns3 size={12} /> الأعمدة
              {showColumnPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showColumnPicker && (
              <div className="absolute left-0 top-10 z-20 bg-white border border-gray-200 shadow-lg rounded-xl p-3 w-64 space-y-2">
                <p className="text-xs font-semibold text-gray-600 mb-1">إظهار/إخفاء الأعمدة</p>
                {MANIFEST_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
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
          <button onClick={() => handlePrint('all')} disabled={manifest.length === 0} className={printBtnCls}>
            <Printer size={12} /> طباعة المنافيست
          </button>
          <button onClick={() => handlePrint('bahraini')} disabled={bahrainiManifest.length === 0} className={printBtnCls}>
            <Printer size={12} /> طباعة المنافيست (بحريني)
          </button>
          <button onClick={() => handlePrint('non-bahraini')} disabled={nonBahrainiManifest.length === 0} className={printBtnCls}>
            <Printer size={12} /> طباعة المنافيست (غير بحريني)
          </button>
          <button onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
            <Plus size={12} /> إضافة للمنافيست
          </button>
        </div>
      </div>

      {showPicker && !pickedTraveller && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-2">
          <input
            className={ic}
            placeholder="ابحث عن مسافر..."
            value={travellerSearch}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {searchResults.filter(t => !manifestTravellerIds.includes(t.id)).map(t => (
              <button key={t.id}
                onClick={() => setPickedTraveller(t)}
                className="w-full text-right px-3 py-2 text-sm hover:bg-white rounded-lg transition-colors flex items-center justify-between">
                <span>{t.full_name_ar}</span>
                <span className="text-gray-400 text-xs font-mono">{t.cpr_number}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {pickedTraveller && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-3">
          <p className="text-sm font-medium text-gray-800">{pickedTraveller.full_name_ar}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم المقعد</label>
              <input className={ic} value={draft.seat_number}
                onChange={e => setDraft(d => ({ ...d, seat_number: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">رقم الجواز</label>
              <input className={ic} dir="ltr" value={draft.passport_number}
                onChange={e => setDraft(d => ({ ...d, passport_number: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
            <textarea className={ic + ' resize-none'} rows={2} value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => addEntry.mutate()}
              disabled={addEntry.isPending}
              className="flex-1 bg-emerald-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              حفظ
            </button>
            <button onClick={resetAddFlow}
              className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 py-4 text-center">جارٍ التحميل...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                <th className="text-right py-2 px-2 w-10">#</th>
                {visibleColumns.map(col => (
                  <th key={col.key} className="text-right py-2 px-2 whitespace-nowrap">{col.label}</th>
                ))}
                <th className="py-2 px-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {manifest.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="py-2.5 px-2 text-gray-400">{i + 1}</td>
                  {visibleColumns.map(col => (
                    <td key={col.key} className={`py-2.5 px-2 text-gray-700 ${
                      col.key === 'cpr_number' || col.key === 'phone' || col.key === 'passport_number' ? 'font-mono' : ''
                    } ${col.key === 'full_name_ar' ? 'font-medium text-gray-800' : ''}`}>
                      {manifestCell(m, col.key) || '—'}
                    </td>
                  ))}
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setEditing(m)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => window.confirm('حذف من المنافيست؟') && deleteEntry.mutate(m.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {manifest.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">لا يوجد مسافرون في المنافيست</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">تعديل بيانات المنافيست</h2>
            <p className="text-sm text-gray-600">{editing.traveller?.full_name_ar}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">رقم المقعد</label>
                <input className={ic} value={editing.seat_number ?? ''}
                  onChange={e => setEditing(s => s && ({ ...s, seat_number: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">رقم الجواز</label>
                <input className={ic} dir="ltr" value={editing.passport_number ?? ''}
                  onChange={e => setEditing(s => s && ({ ...s, passport_number: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <textarea className={ic + ' resize-none'} rows={2} value={editing.notes ?? ''}
                onChange={e => setEditing(s => s && ({ ...s, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => updateEntry.mutate(editing)}
                disabled={updateEntry.isPending}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Print-only manifest sheet */}
    {printFilter && (
      <div id="umrah-manifest-print" className="hidden print:block" dir="rtl">
        <PrintCampaignHeader header={campaignPrintHeader} />
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', color: '#000' }}>{tripName}</h1>
        <p style={{ fontSize: '13px', marginBottom: '16px', color: '#000' }}>{printSubtitle}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#000' }}>
          <thead>
            <tr>
              <th style={printTh}>#</th>
              {visibleColumns.map(col => (
                <th key={col.key} style={printTh}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printRows.map((m, i) => (
              <tr key={m.id}>
                <td style={printTd}>{i + 1}</td>
                {visibleColumns.map(col => (
                  <td key={col.key} style={printTd}>{manifestCell(m, col.key) || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {printFilter && (
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #umrah-manifest-print, #umrah-manifest-print * { visibility: visible; }
          #umrah-manifest-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; }
        }
      `}</style>
    )}
    </>
  )
}

const printTh = {
  border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontWeight: 700, background: '#fff', color: '#000',
} as const
const printTd = {
  border: '1px solid #000', padding: '6px 8px', textAlign: 'right', color: '#000',
} as const
