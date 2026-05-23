// src/pages/RoomRequestsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { MessageSquare, CheckCircle2, Clock, AlertCircle, RefreshCw, X, Plus, Search, Trash2 } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  new:         { label: 'جديد',          color: 'bg-red-100 text-red-700',    icon: AlertCircle },
  in_progress: { label: 'قيد المعالجة', color: 'bg-amber-100 text-amber-700', icon: Clock },
  closed:      { label: 'مغلق',          color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
}

const TYPE_LABELS: Record<string, string> = {
  maintenance:  'صيانة',
  observation:  'ملاحظة',
  general:      'طلب عام',
}

const REQUEST_TYPE_OPTIONS = [
  { value: 'maintenance', label: 'صيانة' },
  { value: 'observation', label: 'ملاحظة' },
  { value: 'general', label: 'طلب عام' },
] as const

type SelectedTraveller = { id: string; full_name_ar: string; cpr_number: string }

const DEFAULT_HOTEL_NAME = 'نزل إبداء اصداف'

const EMPTY_CREATE_FORM = {
  request_type: 'general',
  description: '',
  hotel_name: '',
  room_number: '',
}

async function notifyStaffNewRoomRequest(
  fullNameAr: string,
  roomNumber: string | null,
  requestType: string
) {
  const typeLabel = TYPE_LABELS[requestType] ?? requestType
  const roomDisplay = roomNumber?.trim() || '—'

  try {
    const { data: staffTokens } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_type', 'staff')

    const tokens = (staffTokens ?? []).map((row: { token: string }) => row.token).filter(Boolean)
    if (tokens.length === 0) return

    const { error: pushError } = await supabase.functions.invoke('dynamic-action', {
      body: {
        title: 'طلب خدمة جديد 🔔',
        message: `${fullNameAr} - غرفة ${roomDisplay} - ${typeLabel}`,
        tokens,
        send_sms: true,
        sms_message: `طلب خدمة جديد من ${fullNameAr} - غرفة ${roomNumber || '—'} - ${typeLabel}`,
      },
    })
    if (pushError) {
      console.error('[room-request] staff push error:', pushError)
    }
  } catch (pushErr) {
    console.error('[room-request] staff push failed:', pushErr)
  }
}

export default function RoomRequestsPage() {
  const qc = useQueryClient()
  const authUser = useAuthStore(s => s.user)
  const isAdmin = authUser?.role === 'admin'
  const [filter, setFilter]   = useState<'all' | 'new' | 'in_progress' | 'closed'>('all')
  const [selected, setSelected] = useState<any>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [replyText, setReplyText] = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [travellerSearch, setTravellerSearch] = useState('')
  const [selectedTraveller, setSelectedTraveller] = useState<SelectedTraveller | null>(null)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState('')
  const [roomLoading, setRoomLoading] = useState(false)

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['room-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('room_requests')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers-list-room-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('travellers')
        .select('id, full_name_ar, cpr_number')
        .order('full_name_ar')
      return (data ?? []) as SelectedTraveller[]
    },
    enabled: createModal,
  })

  const travellerSearchTerm = travellerSearch.trim().toLowerCase()
  const matchingTravellers = travellerSearchTerm
    ? travellers.filter(t =>
        (t.full_name_ar ?? '').toLowerCase().includes(travellerSearchTerm) ||
        (t.cpr_number ?? '').toLowerCase().includes(travellerSearchTerm)
      )
    : travellers

  const loadTravellerRoomAssignment = async (travellerId: string) => {
    setRoomLoading(true)
    try {
      const { data: assignment } = await supabase
        .from('room_assignments')
        .select('room:rooms(room_number, hotel:hotels(hotel_name))')
        .eq('traveller_id', travellerId)
        .limit(1)
        .maybeSingle()

      const room = (assignment as { room?: { room_number?: string; hotel?: { hotel_name?: string } } })?.room

      if (room?.hotel?.hotel_name || room?.room_number) {
        setCreateForm(f => ({
          ...f,
          hotel_name: room.hotel?.hotel_name ?? DEFAULT_HOTEL_NAME,
          room_number: room.room_number ?? '',
        }))
      } else {
        setCreateForm(f => ({
          ...f,
          hotel_name: DEFAULT_HOTEL_NAME,
          room_number: '',
        }))
      }
    } catch {
      setCreateForm(f => ({
        ...f,
        hotel_name: DEFAULT_HOTEL_NAME,
        room_number: '',
      }))
    }
    setRoomLoading(false)
  }

  const selectTraveller = (t: SelectedTraveller) => {
    setSelectedTraveller(t)
    setTravellerSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`)
    setCreateError('')
    void loadTravellerRoomAssignment(t.id)
  }

  const openCreateModal = () => {
    setCreateModal(true)
    setTravellerSearch('')
    setSelectedTraveller(null)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateError('')
    setRoomLoading(false)
  }

  const closeCreateModal = () => {
    setCreateModal(false)
    setTravellerSearch('')
    setSelectedTraveller(null)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateError('')
    setRoomLoading(false)
  }

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!selectedTraveller) throw new Error('no_traveller')
      if (!createForm.description.trim()) throw new Error('no_description')

      const roomNumber = createForm.room_number.trim() || null

      await supabase.from('room_requests').insert({
        cpr_number: selectedTraveller.cpr_number,
        full_name_ar: selectedTraveller.full_name_ar,
        room_number: roomNumber,
        hotel_name: createForm.hotel_name.trim() || DEFAULT_HOTEL_NAME,
        request_type: createForm.request_type,
        description: createForm.description.trim(),
        status: 'new',
      }).throwOnError()

      await notifyStaffNewRoomRequest(
        selectedTraveller.full_name_ar,
        roomNumber,
        createForm.request_type
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-requests'] })
      closeCreateModal()
    },
    onError: (err: Error) => {
      if (err.message === 'no_traveller') {
        setCreateError('يرجى اختيار الحاج')
      } else if (err.message === 'no_description') {
        setCreateError('يرجى كتابة وصف الطلب')
      } else {
        setCreateError('تعذّر إنشاء الطلب، يرجى المحاولة مجددًا')
      }
    },
  })

  const updateRequest = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      await supabase.from('room_requests').update({
        status,
        admin_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-requests'] })
      setSelected(null)
    },
  })

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('room_requests').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-requests'] })
      setSelected(null)
      setReplyText('')
    },
  })

  const { data: requestMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['room-request-messages', selected?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('room_request_messages')
        .select('*')
        .eq('room_request_id', selected!.id)
        .order('created_at', { ascending: true })
      return (data ?? []) as any[]
    },
    enabled: !!selected?.id,
  })

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!selected?.id || !replyText.trim()) throw new Error('empty')
      await supabase.from('room_request_messages').insert({
        room_request_id: selected.id,
        sender_type: 'staff',
        sender_name: authUser?.full_name ?? authUser?.username ?? 'الموظف',
        message: replyText.trim(),
      }).throwOnError()
    },
    onSuccess: () => {
      setReplyText('')
      qc.invalidateQueries({ queryKey: ['room-request-messages', selected?.id] })
    },
  })

  const openRequestDetail = (request: any) => {
    setSelected(request)
    setAdminNotes(request.admin_notes ?? '')
    setReplyText('')
  }

  const filtered = requests.filter((r: any) => filter === 'all' || r.status === filter)

  const newCount        = requests.filter((r: any) => r.status === 'new').length
  const inProgressCount = requests.filter((r: any) => r.status === 'in_progress').length
  const closedCount     = requests.filter((r: any) => r.status === 'closed').length

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">طلبات الخدمة</h1>
          <p className="text-sm text-gray-500 mt-0.5">طلبات الحجاج من غرفهم</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={15} /> إنشاء طلب
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm"
          >
            <RefreshCw size={14} /> تحديث
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'جديد',          count: newCount,        color: 'text-red-600',    bg: 'bg-red-50',    key: 'new' },
          { label: 'قيد المعالجة', count: inProgressCount, color: 'text-amber-600',  bg: 'bg-amber-50',  key: 'in_progress' },
          { label: 'مغلق',          count: closedCount,     color: 'text-green-600',  bg: 'bg-green-50',  key: 'closed' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key as any)}
            className={`rounded-xl border p-3 text-center transition-all ${filter === s.key ? 'border-emerald-400 shadow-md' : 'border-gray-100'} ${s.bg}`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['all','الكل'],['new','جديد'],['in_progress','قيد المعالجة'],['closed','مغلق']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {/* Requests list */}
      {isLoading ? (
        <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          <MessageSquare size={36} className="mx-auto mb-3 opacity-30" />
          لا توجد طلبات
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const statusInfo = STATUS_LABELS[r.status]
            const StatusIcon = statusInfo.icon
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-emerald-200 transition-colors"
                onClick={() => openRequestDetail(r)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{r.full_name_ar}</span>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        <StatusIcon size={10} /> {statusInfo.label}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                        {TYPE_LABELS[r.request_type]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {r.room_number && <span>غرفة {r.room_number}</span>}
                      {r.hotel_name  && <span>{r.hotel_name}</span>}
                      <span>{new Date(r.created_at).toLocaleString('ar-BH')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create request modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">إنشاء طلب خدمة</h2>
              <button type="button" onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">الحاج</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={travellerSearch}
                  onChange={e => {
                    setTravellerSearch(e.target.value)
                    setSelectedTraveller(null)
                    setCreateForm(f => ({ ...f, hotel_name: '', room_number: '' }))
                    setCreateError('')
                  }}
                  placeholder="ابحث بالاسم أو رقم البطاقة..."
                />
              </div>
              {travellerSearch.trim() && !selectedTraveller && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                  {matchingTravellers.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-400 text-center">لا توجد نتائج</p>
                  ) : (
                    matchingTravellers.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTraveller(t)}
                        className="w-full text-right px-3 py-2.5 text-sm hover:bg-emerald-50 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-800">{t.full_name_ar}</span>
                        <span className="text-gray-400 text-xs mr-2 font-mono">{t.cpr_number}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {selectedTraveller && (
                <p className="text-xs text-emerald-700 mt-1.5 bg-emerald-50 rounded-lg px-2 py-1">
                  تم اختيار: {selectedTraveller.full_name_ar} ({selectedTraveller.cpr_number})
                  {roomLoading && <span className="text-gray-500 mr-2"> — جارٍ تحميل بيانات الغرفة...</span>}
                </p>
              )}
            </div>

            {selectedTraveller && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الفندق</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={createForm.hotel_name}
                    onChange={e => setCreateForm(f => ({ ...f, hotel_name: e.target.value }))}
                    placeholder={DEFAULT_HOTEL_NAME}
                    disabled={roomLoading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">رقم الغرفة</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={createForm.room_number}
                    onChange={e => setCreateForm(f => ({ ...f, room_number: e.target.value }))}
                    placeholder="—"
                    disabled={roomLoading}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نوع الطلب</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={createForm.request_type}
                onChange={e => setCreateForm(f => ({ ...f, request_type: e.target.value }))}
              >
                {REQUEST_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">وصف الطلب</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={4}
                placeholder="اشرح الطلب بالتفصيل..."
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {createError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{createError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeCreateModal}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => createRequest.mutate()}
                disabled={createRequest.isPending}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {createRequest.isPending ? 'جارٍ الحفظ...' : 'إرسال الطلب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">تفاصيل الطلب</h2>
              <button onClick={() => { setSelected(null); setReplyText('') }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">الحاج:</span>
                <span className="font-medium">{selected.full_name_ar}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">رقم البطاقة:</span>
                <span className="font-mono">{selected.cpr_number}</span>
              </div>
              {selected.room_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500">الغرفة:</span>
                  <span>{selected.room_number}</span>
                </div>
              )}
              {selected.hotel_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">الفندق:</span>
                  <span>{selected.hotel_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">نوع الطلب:</span>
                <span>{TYPE_LABELS[selected.request_type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">التاريخ:</span>
                <span>{new Date(selected.created_at).toLocaleString('ar-BH')}</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">وصف الطلب:</p>
              <p className="text-sm text-gray-800">{selected.description}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات المنسق</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={3}
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="أضف ملاحظاتك هنا..."
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">تغيير الحالة:</p>
              <div className="flex gap-2">
                <button onClick={() => updateRequest.mutate({ id: selected.id, status: 'in_progress', notes: adminNotes })}
                  disabled={selected.status === 'in_progress' || updateRequest.isPending || deleteRequest.isPending}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  قيد المعالجة
                </button>
                <button onClick={() => updateRequest.mutate({ id: selected.id, status: 'closed', notes: adminNotes })}
                  disabled={selected.status === 'closed' || updateRequest.isPending || deleteRequest.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  إغلاق الطلب
                </button>
                <button onClick={() => updateRequest.mutate({ id: selected.id, status: 'new', notes: adminNotes })}
                  disabled={selected.status === 'new' || updateRequest.isPending || deleteRequest.isPending}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  إعادة فتح
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    title="حذف الطلب"
                    onClick={() => {
                      if (!window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) return
                      deleteRequest.mutate(selected.id)
                    }}
                    disabled={deleteRequest.isPending || updateRequest.isPending}
                    className="flex items-center justify-center px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-40 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-medium text-gray-600">الردود والتعليقات</p>
              {messagesLoading ? (
                <p className="text-sm text-gray-400 text-center py-2">جارٍ التحميل...</p>
              ) : requestMessages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">لا توجد ردود بعد</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {requestMessages.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`flex w-full ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm border ${
                          msg.sender_type === 'staff'
                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                            : 'bg-green-50 border-green-200 text-green-900'
                        }`}
                      >
                        <p className="text-xs font-semibold opacity-80 mb-0.5">{msg.sender_name}</p>
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        <p className="text-[10px] opacity-60 mt-1">
                          {new Date(msg.created_at).toLocaleString('ar-BH')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="اكتب ردك..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
                      e.preventDefault()
                      sendReply.mutate()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => sendReply.mutate()}
                  disabled={!replyText.trim() || sendReply.isPending}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  {sendReply.isPending ? '...' : 'إرسال رد'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
