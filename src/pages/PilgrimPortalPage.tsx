// src/pages/PilgrimPortalPage.tsx
// Public-facing portal for pilgrims to login with CPR and view their info
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  requestNotificationPermission,
  onForegroundMessage,
  type NotificationPermissionResult,
} from '../lib/firebase'
import { Search, Download, BedDouble, CheckCircle2, XCircle, FileText, LogOut, Bell, BellOff, MessageSquare, X, Bus, Clock } from 'lucide-react'

type HajjRituals = {
  traveller_id: string
  rami_completed: boolean
  rami_time: string | null
  dhabh_completed: boolean
  dhabh_time: string | null
}

function formatRitualTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ar-BH', { dateStyle: 'short', timeStyle: 'short' })
}

const LOGO_URL = 'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function supportsWebNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

type Step = 'login' | 'confirm' | 'portal'

export default function PilgrimPortalPage() {
  const [step,       setStep]       = useState<Step>('login')
  const [cpr,        setCpr]        = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [traveller,  setTraveller]  = useState<any>(null)
  const [documents,  setDocuments]  = useState<any[]>([])
  const [rooms,      setRooms]      = useState<any[]>([])
  const [adahiInv,   setAdahiInv]   = useState<any>(null)
  const [adahiRcp,   setAdahiRcp]   = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifPermission, setNotifPermission] = useState<'default' | 'granted' | 'denied'>('default')
  const [foregroundNotif, setForegroundNotif] = useState<any>(null)
  const [roomRequests, setRoomRequests] = useState<any[]>([])
  const [requestModal, setRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({ request_type: 'general', description: '' })
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({})
  const [messagesByRequest, setMessagesByRequest] = useState<Record<string, any[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null)
  const [busInfo, setBusInfo] = useState<{ bus_number: number; bus_name: string | null } | null>(null)
  const [hajjRituals, setHajjRituals] = useState<HajjRituals | null>(null)
  const [ramiConfirmOpen, setRamiConfirmOpen] = useState(false)
  const [ramiSubmitting, setRamiSubmitting] = useState(false)
  const [ritualError, setRitualError] = useState('')

  const syncNotifPermission = () => {
    if (supportsWebNotifications()) {
      setNotifPermission(Notification.permission as 'default' | 'granted' | 'denied')
    }
  }

  const failureAlertMessage = (result: Extract<NotificationPermissionResult, { ok: false }>) => {
    if (result.reason === 'unsupported') {
      return 'متصفحك لا يدعم الإشعارات'
    }
    if (result.reason === 'denied') {
      return 'تم رفض الإشعارات، يرجى السماح بها من إعدادات المتصفح'
    }
    return 'تعذّر تفعيل الإشعارات. يرجى المحاولة مرة أخرى.'
  }

  // Check notification permission on load (not available on iPhone Safari until installed to home screen)
  useEffect(() => {
    syncNotifPermission()
    const unsubscribe = onForegroundMessage((payload: any) => {
      setForegroundNotif(payload.notification)
      setTimeout(() => setForegroundNotif(null), 5000)
    })
    return () => unsubscribe?.()
  }, [])

  const enableNotifications = async (cprNumber: string) => {
    console.log('[notifications] requestNotificationPermission called', { cprNumber })

    if (!supportsWebNotifications()) {
      alert('متصفحك لا يدعم الإشعارات')
      return
    }

    const result = await requestNotificationPermission()
    console.log('[notifications] permission result:', result)

    if (result.ok) {
      setNotifPermission('granted')
      const { error: upsertError } = await supabase.from('fcm_tokens').upsert({
        cpr_number: cprNumber,
        token: result.token,
        device_info: navigator.userAgent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })

      if (upsertError) {
        console.error('[notifications] fcm_tokens upsert error:', upsertError)
        alert('تم تفعيل الإشعارات لكن تعذّر حفظ الإعدادات. يرجى المحاولة مرة أخرى.')
        return
      }

      console.log('[notifications] fcm_tokens upsert success')
      return
    }

    syncNotifPermission()
    alert(failureAlertMessage(result))
  }

  // ── Step 1: Look up CPR ───────────────────────────────────────────────────
  const lookupCpr = async () => {
    if (!cpr.trim()) return
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .from('travellers')
        .select('id, full_name_ar, cpr_number, gender')
        .eq('cpr_number', cpr.trim())
        .single()

      if (error || !data) {
        setError('رقم البطاقة الشخصية غير موجود في النظام')
        setLoading(false)
        return
      }

      setTraveller(data)
      setStep('confirm')
    } catch {
      setError('حدث خطأ، يرجى المحاولة مجددًا')
    }
    setLoading(false)
  }

  // ── Step 2: Confirm identity then load all data ───────────────────────────
  const confirmIdentity = async () => {
    setLoading(true)
    try {
      // Fetch permit documents
      const { data: docs } = await supabase
        .from('traveller_documents')
        .select('*')
        .eq('traveller_id', traveller.id)
        .eq('doc_type', 'visa')

      // Fetch room assignments
      const { data: roomData } = await supabase
        .from('room_assignments')
        .select('*, room:rooms(room_number, room_type, floor, hotel:hotels(hotel_name, city))')
        .eq('traveller_id', traveller.id)

      const roomIds = [...new Set((roomData ?? []).map((ra: any) => ra.room_id).filter(Boolean))]
      const roommatesByRoomId: Record<string, { full_name_ar: string }[]> = {}

      if (roomIds.length > 0) {
        const { data: roommateRows } = await supabase
          .from('room_assignments')
          .select('room_id, traveller:travellers(full_name_ar)')
          .in('room_id', roomIds)
          .neq('traveller_id', traveller.id)

        for (const row of roommateRows ?? []) {
          const name = (row as any).traveller?.full_name_ar
          if (!name || !(row as any).room_id) continue
          const rid = (row as any).room_id as string
          if (!roommatesByRoomId[rid]) roommatesByRoomId[rid] = []
          roommatesByRoomId[rid].push({ full_name_ar: name })
        }
      }

      const roomsWithMates = (roomData ?? []).map((ra: any) => ({
        ...ra,
        roommates: roommatesByRoomId[ra.room_id] ?? [],
      }))

      // Fetch adahi invoice
      const { data: invData } = await supabase
        .from('invoices')
        .select('*')
        .eq('traveller_id', traveller.id)
        .ilike('description', '%أضحية%')
        .single()

      // Fetch adahi receipt if paid
      if (invData) {
        const { data: rcpData } = await supabase
          .from('receipts')
          .select('*')
          .eq('invoice_id', invData.id)
          .single()
        setAdahiRcp(rcpData ?? null)
      }

      // Fetch active notifications
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      const { data: reqData } = await supabase
        .from('room_requests')
        .select('*')
        .eq('cpr_number', traveller.cpr_number)
        .order('created_at', { ascending: false })

      const { data: busAssign } = await supabase
        .from('bus_assignments')
        .select('bus:buses(bus_number, bus_name)')
        .eq('traveller_id', traveller.id)
        .maybeSingle()

      const bus = (busAssign as any)?.bus
      setBusInfo(
        bus
          ? { bus_number: bus.bus_number, bus_name: bus.bus_name ?? null }
          : null
      )

      const { data: ritualsData } = await supabase
        .from('hajj_rituals')
        .select('traveller_id, rami_completed, rami_time, dhabh_completed, dhabh_time')
        .eq('traveller_id', traveller.id)
        .maybeSingle()

      setHajjRituals((ritualsData as HajjRituals | null) ?? null)
      setRamiConfirmOpen(false)
      setRitualError('')

      setDocuments(docs ?? [])
      setRooms(roomsWithMates)
      setAdahiInv(invData ?? null)
      setNotifications(notifData ?? [])
      setRoomRequests(reqData ?? [])
      setRequestSuccess(false)
      setRequestError('')
      setStep('portal')

      if (supportsWebNotifications()) {
        await enableNotifications(traveller.cpr_number)
      }
    } catch {
      setError('حدث خطأ في تحميل البيانات')
    }
    setLoading(false)
  }

  const printAdahiReceipt = () => {
    if (!adahiRcp || !adahiInv) return
    const date = new Date().toLocaleDateString('ar-BH')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إيصال أضحية</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
          body { margin: 20px; direction: rtl; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .header img { height: 80px; display: block; margin: 0 auto 10px auto; }
          .header h1 { font-size: 20px; margin: 0; }
          .header h2 { font-size: 16px; margin: 5px 0; color: #555; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
          .label { color: #666; }
          .value { font-weight: bold; }
          .amount { font-size: 20px; font-weight: bold; text-align: center; border: 2px solid #000; padding: 10px; margin: 15px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print { body { margin: 5mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${LOGO_URL}" crossorigin="anonymous" />
          <h1>حملة العمار للحج والعمرة</h1>
          <h2>إيصال استلام أضحية</h2>
        </div>
        <div class="row"><span class="label">رقم الإيصال:</span><span class="value">${adahiRcp.receipt_number}</span></div>
        <div class="row"><span class="label">التاريخ:</span><span class="value">${adahiRcp.payment_date}</span></div>
        <div class="row"><span class="label">اسم الحاج:</span><span class="value">${traveller.full_name_ar}</span></div>
        <div class="row"><span class="label">رقم البطاقة:</span><span class="value">${traveller.cpr_number}</span></div>
        <div class="row"><span class="label">الوصف:</span><span class="value">${adahiInv.description}</span></div>
        <div class="row"><span class="label">طريقة الدفع:</span><span class="value">نقدي</span></div>
        <div class="amount">المبلغ المستلم: ${Number(adahiRcp.amount).toLocaleString('en-US')} ريال سعودي</div>
        <div class="footer"><p>حملة العمار للحج والعمرة</p></div>
        <script>window.onload = () => { setTimeout(() => { window.print(); setTimeout(() => window.close(), 2000); }, 1500); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  const confirmRami = async () => {
    if (!traveller?.id) return
    setRamiSubmitting(true)
    setRitualError('')
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('hajj_rituals')
      .upsert(
        {
          traveller_id: traveller.id,
          rami_completed: true,
          rami_time: now,
          updated_at: now,
        },
        { onConflict: 'traveller_id' }
      )
      .select('traveller_id, rami_completed, rami_time, dhabh_completed, dhabh_time')
      .single()

    setRamiSubmitting(false)
    if (error) {
      setRitualError('تعذّر الحفظ. يرجى المحاولة مرة أخرى.')
      return
    }
    setHajjRituals(data as HajjRituals)
    setRamiConfirmOpen(false)
  }

  const logout = () => {
    setStep('login')
    setCpr('')
    setTraveller(null)
    setDocuments([])
    setRooms([])
    setAdahiInv(null)
    setAdahiRcp(null)
    setNotifications([])
    setRoomRequests([])
    setBusInfo(null)
    setHajjRituals(null)
    setRamiConfirmOpen(false)
    setRitualError('')
    setRequestModal(false)
    setRequestForm({ request_type: 'general', description: '' })
    setRequestSuccess(false)
    setRequestError('')
    setExpandedReplies({})
    setMessagesByRequest({})
    setCommentDrafts({})
    setCommentSubmitting(null)
    setError('')
  }

  const loadRequestMessages = async (requestId: string) => {
    const { data } = await supabase
      .from('room_request_messages')
      .select('*')
      .eq('room_request_id', requestId)
      .order('created_at', { ascending: true })
    setMessagesByRequest(prev => ({ ...prev, [requestId]: data ?? [] }))
  }

  const toggleReplies = async (requestId: string) => {
    const willOpen = !expandedReplies[requestId]
    setExpandedReplies(prev => ({ ...prev, [requestId]: willOpen }))
    if (willOpen && !messagesByRequest[requestId]) {
      await loadRequestMessages(requestId)
    }
  }

  const sendPilgrimComment = async (requestId: string) => {
    const text = (commentDrafts[requestId] ?? '').trim()
    if (!text || !traveller) return
    setCommentSubmitting(requestId)
    try {
      const { error } = await supabase.from('room_request_messages').insert({
        room_request_id: requestId,
        sender_type: 'pilgrim',
        sender_name: traveller.full_name_ar,
        message: text,
      })
      if (error) throw error
      setCommentDrafts(prev => ({ ...prev, [requestId]: '' }))
      await loadRequestMessages(requestId)
      setExpandedReplies(prev => ({ ...prev, [requestId]: true }))
    } catch {
      alert('تعذّر إرسال التعليق، يرجى المحاولة مجددًا')
    }
    setCommentSubmitting(null)
  }

  const REQUEST_TYPE_OPTIONS = [
    { value: 'maintenance', label: 'صيانة' },
    { value: 'observation', label: 'ملاحظة' },
    { value: 'general', label: 'طلب عام' },
  ] as const

  const REQUEST_TYPE_AR: Record<string, string> = {
    maintenance: 'صيانة',
    observation: 'ملاحظة',
    general: 'طلب عام',
  }

  const REQUEST_STATUS_AR: Record<string, string> = {
    new: 'جديد',
    in_progress: 'قيد المعالجة',
    closed: 'مغلق',
  }

  const REQUEST_STATUS_COLOR: Record<string, string> = {
    new: 'bg-red-100 text-red-700',
    in_progress: 'bg-amber-100 text-amber-700',
    closed: 'bg-green-100 text-green-700',
  }

  const submitRoomRequest = async () => {
    if (!requestForm.description.trim()) {
      setRequestError('يرجى كتابة وصف الطلب')
      return
    }
    const primaryRoom = rooms[0]
    setRequestSubmitting(true)
    setRequestError('')
    try {
      const { error } = await supabase.from('room_requests').insert({
        cpr_number: traveller.cpr_number,
        full_name_ar: traveller.full_name_ar,
        room_number: primaryRoom?.room?.room_number ?? null,
        hotel_name: primaryRoom?.room?.hotel?.hotel_name ?? null,
        request_type: requestForm.request_type,
        description: requestForm.description.trim(),
        status: 'new',
      })
      if (error) throw error

      const roomNumber = primaryRoom?.room?.room_number ?? '—'
      const typeLabel = REQUEST_TYPE_AR[requestForm.request_type] ?? requestForm.request_type

      try {
        const { data: staffTokens } = await supabase
          .from('fcm_tokens')
          .select('token')
          .eq('user_type', 'staff')

        const tokens = (staffTokens ?? []).map((row: { token: string }) => row.token).filter(Boolean)
        if (tokens.length > 0) {
          const { error: pushError } = await supabase.functions.invoke('dynamic-action', {
            body: {
              title: 'طلب خدمة جديد 🔔',
              message: `${traveller.full_name_ar} - غرفة ${roomNumber} - ${typeLabel}`,
              tokens,
              send_sms: true,
              sms_message: `طلب خدمة جديد من ${traveller.full_name_ar} - غرفة ${roomNumber || '—'} - ${typeLabel}`,
            },
          })
          if (pushError) {
            console.error('[room-request] staff push error:', pushError)
          }
        }
      } catch (pushErr) {
        console.error('[room-request] staff push failed:', pushErr)
      }

      const { data: refreshed } = await supabase
        .from('room_requests')
        .select('*')
        .eq('cpr_number', traveller.cpr_number)
        .order('created_at', { ascending: false })

      setRoomRequests(refreshed ?? [])
      setRequestModal(false)
      setRequestForm({ request_type: 'general', description: '' })
      setRequestSuccess(true)
    } catch {
      setRequestError('تعذّر إرسال الطلب، يرجى المحاولة مجددًا')
    }
    setRequestSubmitting(false)
  }

  const ROOM_TYPE_AR: Record<string, string> = {
    single: 'مفردة', double: 'مزدوجة', triple: 'ثلاثية', quad: 'رباعية', quint: 'خماسية', sextuple: 'سداسية'
  }

  return (
    <div className="min-h-screen bg-emerald-50 flex flex-col" dir="rtl">

      {/* Foreground notification toast */}
      {foregroundNotif && (
        <div className="fixed top-4 right-4 left-4 z-50 bg-emerald-700 text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-pulse">
          <Bell size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">{foregroundNotif.title}</p>
            <p className="text-xs opacity-90 mt-0.5">{foregroundNotif.body}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="logo" className="h-10 object-contain" />
          <div>
            <p className="font-bold text-emerald-800 text-sm">حملة العمار للحج والعمرة</p>
            <p className="text-xs text-gray-400">بوابة الحاج</p>
          </div>
        </div>
        {step === 'portal' && (
          <div className="flex items-center gap-2">
            {notifPermission === 'granted'
              ? <Bell size={16} className="text-emerald-600" title="الإشعارات مفعّلة" />
              : notifPermission === 'denied'
              ? <BellOff size={16} className="text-gray-400" title="الإشعارات معطّلة" />
              : null
            }
            <button onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors">
              <LogOut size={15} /> خروج
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-md space-y-4">

          {/* ── STEP 1: Login ── */}
          {step === 'login' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <div className="text-center">
                <img
                  src={LOGO_URL}
                  alt="حملة العمار للحج والعمرة"
                  style={{ height: '80px', display: 'block', margin: '0 auto' }}
                  className="object-contain mb-3"
                />
                <h1 className="text-xl font-bold text-gray-800">بوابة الحاج</h1>
                <p className="text-sm text-gray-500 mt-1">أدخل رقم بطاقتك الشخصية للدخول</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  رقم البطاقة الشخصية (CPR)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpr}
                  onChange={e => setCpr(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookupCpr()}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="أدخل رقم البطاقة"
                  dir="ltr"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
                  {error}
                </div>
              )}

              <button onClick={lookupCpr} disabled={loading || !cpr.trim()}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Search size={18} />
                {loading ? 'جارٍ البحث...' : 'دخول'}
              </button>
            </div>
          )}

          {/* ── STEP 2: Confirm identity ── */}
          {step === 'confirm' && traveller && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <div className="text-center">
                <div className="text-4xl mb-2">{traveller.gender === 'female' ? '🧕' : '👨'}</div>
                <h2 className="text-sm text-gray-500">هل هذا اسمك؟</h2>
                <p className="text-2xl font-bold text-gray-800 mt-2">{traveller.full_name_ar}</p>
                <p className="text-sm text-gray-400 font-mono mt-1">{traveller.cpr_number}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={confirmIdentity} disabled={loading}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                  {loading ? 'جارٍ التحميل...' : 'نعم، هذا أنا'}
                </button>
                <button onClick={logout}
                  className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-3 rounded-xl text-sm">
                  لا، رجوع
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Portal ── */}
          {step === 'portal' && traveller && (
            <div className="space-y-4">
              {/* Welcome */}
              <div className="bg-emerald-700 rounded-2xl p-5 text-white text-center">
                <div className="text-3xl mb-2">{traveller.gender === 'female' ? '🧕' : '👨'}</div>
                <p className="text-sm opacity-80">أهلاً بك</p>
                <p className="text-xl font-bold">{traveller.full_name_ar}</p>
                <p className="text-sm opacity-70 font-mono mt-0.5">{traveller.cpr_number}</p>
              </div>

              {busInfo && (
                <div className="bg-amber-500 rounded-2xl p-5 text-white shadow-md">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Bus size={24} className="opacity-90 shrink-0" />
                    <p className="text-sm font-medium opacity-90">باصك</p>
                  </div>
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <span className="text-4xl font-bold leading-none tabular-nums">
                      {busInfo.bus_number}
                    </span>
                    <p className="text-lg font-bold leading-snug text-right min-w-0">
                      {busInfo.bus_name?.trim() || `باص ${busInfo.bus_number}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Enable notifications — browsers with Notification API */}
              {supportsWebNotifications() && notifPermission === 'default' && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
                  <Bell size={20} className="text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">فعّل الإشعارات</p>
                    <p className="text-xs text-blue-600 mt-0.5">احصل على آخر التحديثات والإعلانات مباشرة على هاتفك</p>
                  </div>
                  <button onClick={() => enableNotifications(traveller.cpr_number)}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shrink-0">
                    تفعيل
                  </button>
                </div>
              )}

              {/* iPhone/iPad Safari — no Notification API until added to home screen */}
              {isAppleMobileDevice() && !supportsWebNotifications() && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    📱 لاستلام الإشعارات على {/iPad/i.test(navigator.userAgent) ? 'iPad' : 'iPhone'}
                  </p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    متصفح Safari لا يدعم الإشعارات مباشرة. اضغط على زر المشاركة <strong>⬆️</strong> ثم اختر{' '}
                    <strong>«أضف إلى الشاشة الرئيسية»</strong>، وافتح التطبيق من الشاشة الرئيسية ثم فعّل الإشعارات.
                  </p>
                </div>
              )}

              {/* Active notifications */}
              {notifications.length > 0 && (
                <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
                  <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Bell size={18} className="text-blue-600" />
                    إعلانات وتنبيهات
                  </h2>
                  <div className="space-y-3">
                    {notifications.map((n: any) => (
                      <div key={n.id} className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                        <p className="font-medium text-blue-800 text-sm">{n.title}</p>
                        <p className="text-xs text-blue-600 mt-1">{n.message}</p>
                        <p className="text-xs text-blue-400 mt-1">{new Date(n.created_at).toLocaleDateString('ar-BH')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rami & Dhabh */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-lg">🕋</span>
                  رمي الجمرات والذبح
                </h2>

                {!hajjRituals?.rami_completed ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      بعد إتمام رمي الجمرات، اضغط الزر أدناه لتسجيل ذلك في النظام.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRamiConfirmOpen(true)}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl transition-colors"
                    >
                      أتممت رمي الجمرات ✓
                    </button>
                    {ritualError && (
                      <p className="text-sm text-red-600 text-center">{ritualError}</p>
                    )}
                  </div>
                ) : hajjRituals.dhabh_completed ? (
                  <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle2 size={22} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-green-800">✓ تم الذبح</p>
                      {hajjRituals.dhabh_time && (
                        <p className="text-xs text-green-600 mt-1">
                          {formatRitualTime(hajjRituals.dhabh_time)}
                        </p>
                      )}
                      {hajjRituals.rami_time && (
                        <p className="text-xs text-green-600/80 mt-0.5">
                          رمي الجمرات: {formatRitualTime(hajjRituals.rami_time)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <Clock size={22} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800">✓ تم رمي الجمرات — في انتظار الذبح</p>
                      {hajjRituals.rami_time && (
                        <p className="text-xs text-amber-600 mt-1">
                          {formatRitualTime(hajjRituals.rami_time)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Permit download */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <FileText size={18} className="text-emerald-600" />
                  تصريح الحج
                </h2>
                {documents.length === 0 ? (
                  <div className="text-center py-4">
                    <XCircle size={32} className="mx-auto text-red-400 mb-2" />
                    <p className="text-sm text-gray-500">لم يتم رفع التصريح بعد</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 hover:bg-emerald-100 transition-colors">
                        <span className="text-sm font-medium text-emerald-800">{doc.notes ?? 'تصريح الحج 1447'}</span>
                        <div className="flex items-center gap-1.5 text-emerald-700">
                          <Download size={16} />
                          <span className="text-xs font-medium">تحميل</span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Room assignment */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <BedDouble size={18} className="text-purple-600" />
                  الغرفة في الفندق
                </h2>
                {rooms.length === 0 ? (
                  <div className="text-center py-4">
                    <XCircle size={32} className="mx-auto text-red-400 mb-2" />
                    <p className="text-sm text-gray-500">لم يتم تعيين غرفة بعد</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rooms.map((ra: any) => (
                      <div key={ra.id} className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                        <p className="font-bold text-purple-800">{ra.room?.hotel?.hotel_name}</p>
                        <p className="text-sm text-purple-600 mt-0.5">{ra.room?.hotel?.city}</p>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg font-medium">
                            غرفة {ra.room?.room_number}
                          </span>
                          {ra.room?.floor && (
                            <span className="text-purple-500">الطابق {ra.room.floor}</span>
                          )}
                          <span className="text-purple-500">
                            {ROOM_TYPE_AR[ra.room?.room_type] ?? ra.room?.room_type}
                          </span>
                        </div>
                        {ra.roommates?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-purple-200">
                            <p className="text-xs font-semibold text-purple-700 mb-1.5">الحجاج المرافقين:</p>
                            <ul className="space-y-1">
                              {ra.roommates.map((mate: { full_name_ar: string }, idx: number) => (
                                <li key={idx} className="text-sm text-purple-800">{mate.full_name_ar}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Service request */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <MessageSquare size={18} className="text-orange-600" />
                    طلب خدمة
                  </h2>
                  <button
                    type="button"
                    onClick={() => { setRequestModal(true); setRequestError('') }}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0"
                  >
                    إرسال طلب
                  </button>
                </div>

                {requestSuccess && (
                  <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                    <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                    تم إرسال طلبك بنجاح وسيتم متابعته من قبل الفريق
                  </div>
                )}

                {roomRequests.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-3">لا توجد طلبات سابقة</p>
                ) : (
                  <div className="space-y-2">
                    {roomRequests.map((req: any) => {
                      const isExpanded = !!expandedReplies[req.id]
                      const messages = messagesByRequest[req.id] ?? []
                      return (
                        <div key={req.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium text-orange-900">
                              {REQUEST_TYPE_AR[req.request_type] ?? req.request_type}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REQUEST_STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {REQUEST_STATUS_AR[req.status] ?? req.status}
                            </span>
                          </div>
                          <p className="text-sm text-orange-800 mt-1">{req.description}</p>
                          <p className="text-xs text-orange-500 mt-1">
                            {new Date(req.created_at).toLocaleString('ar-BH')}
                          </p>
                          {req.status === 'closed' && req.admin_notes?.trim() && (
                            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                              <p className="text-xs font-semibold text-blue-800 mb-1">رد المنسق:</p>
                              <p className="whitespace-pre-wrap">{req.admin_notes.trim()}</p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleReplies(req.id)}
                            className="mt-2 text-xs font-medium text-orange-700 hover:text-orange-900 underline"
                          >
                            {isExpanded ? 'إخفاء الردود' : 'عرض الردود'}
                          </button>
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-orange-200 space-y-2">
                              {messages.length === 0 ? (
                                <p className="text-xs text-orange-600 text-center py-1">لا توجد ردود بعد</p>
                              ) : (
                                messages.map((msg: any) => (
                                  <div
                                    key={msg.id}
                                    className={`flex w-full ${msg.sender_type === 'staff' ? 'justify-end' : 'justify-start'}`}
                                  >
                                    <div
                                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm border ${
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
                                ))
                              )}
                              <div className="flex gap-2 pt-1">
                                <input
                                  type="text"
                                  className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                                  placeholder="اكتب تعليقك..."
                                  value={commentDrafts[req.id] ?? ''}
                                  onChange={e =>
                                    setCommentDrafts(prev => ({ ...prev, [req.id]: e.target.value }))
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => sendPilgrimComment(req.id)}
                                  disabled={
                                    !(commentDrafts[req.id] ?? '').trim() ||
                                    commentSubmitting === req.id
                                  }
                                  className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 shrink-0"
                                >
                                  {commentSubmitting === req.id ? '...' : 'إرسال تعليق'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Adahi payment */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-lg">🐑</span>
                  الأضحية
                </h2>
                {!adahiInv ? (
                  <div className="text-center py-4">
                    <XCircle size={32} className="mx-auto text-red-400 mb-2" />
                    <p className="text-sm text-gray-500">لم يتم تسجيل أضحية</p>
                  </div>
                ) : adahiInv.status === 'paid' ? (
                  <div>
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-3">
                      <CheckCircle2 size={20} className="text-green-600" />
                      <div>
                        <p className="font-bold text-green-800">تم الدفع</p>
                        <p className="text-xs text-green-600">{adahiInv.description}</p>
                      </div>
                      <span className="mr-auto font-bold text-green-700">
                        {Number(adahiInv.amount).toLocaleString('en-US')} ر.س
                      </span>
                    </div>
                    {adahiRcp && (
                      <button onClick={printAdahiReceipt}
                        className="w-full flex items-center justify-center gap-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
                        <Download size={15} /> تحميل إيصال الأضحية
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <XCircle size={20} className="text-red-500" />
                    <div>
                      <p className="font-bold text-red-700">لم يتم الدفع بعد</p>
                      <p className="text-xs text-red-500">{adahiInv.description}</p>
                    </div>
                    <span className="mr-auto font-bold text-red-600">
                      {Number(adahiInv.amount).toLocaleString('en-US')} ر.س
                    </span>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Rami confirmation */}
      {ramiConfirmOpen && step === 'portal' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold text-gray-800">تأكيد رمي الجمرات</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              هل أتممت رمي الجمرات؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
                disabled={ramiSubmitting}
                onClick={() => setRamiConfirmOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                disabled={ramiSubmitting}
                onClick={confirmRami}
              >
                {ramiSubmitting ? 'جارٍ الحفظ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4 text-xs text-gray-400">
        حملة العمار للحج والعمرة © 1447
      </div>

      {/* Service request modal */}
      {requestModal && step === 'portal' && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">إرسال طلب خدمة</h2>
              <button
                type="button"
                onClick={() => setRequestModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {rooms.length > 0 && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {rooms[0].room?.hotel?.hotel_name}
                {rooms[0].room?.room_number ? ` — غرفة ${rooms[0].room.room_number}` : ''}
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نوع الطلب</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={requestForm.request_type}
                onChange={e => setRequestForm(f => ({ ...f, request_type: e.target.value }))}
              >
                {REQUEST_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">وصف الطلب</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                rows={4}
                placeholder="اشرح طلبك بالتفصيل..."
                value={requestForm.description}
                onChange={e => setRequestForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {requestError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{requestError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRequestModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={submitRoomRequest}
                disabled={requestSubmitting}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {requestSubmitting ? 'جارٍ الإرسال...' : 'إرسال'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
