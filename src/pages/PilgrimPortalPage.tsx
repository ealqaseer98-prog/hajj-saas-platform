// src/pages/PilgrimPortalPage.tsx
// Public-facing portal for pilgrims to login with CPR and view their info
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { requestNotificationPermission, onForegroundMessage } from '../lib/firebase'
import { Search, Download, BedDouble, CheckCircle2, XCircle, FileText, LogOut, Bell, BellOff } from 'lucide-react'

const LOGO_URL = 'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'

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

  // Check notification permission on load
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission as any)
    }
    // Listen for foreground messages
    const unsubscribe = onForegroundMessage((payload: any) => {
      setForegroundNotif(payload.notification)
      setTimeout(() => setForegroundNotif(null), 5000)
    })
    return () => unsubscribe?.()
  }, [])

  const enableNotifications = async (cprNumber: string) => {
    const token = await requestNotificationPermission()
    if (token) {
      setNotifPermission('granted')
      // Save token linked to CPR
      await supabase.from('fcm_tokens').upsert({
        cpr_number: cprNumber,
        token,
        device_info: navigator.userAgent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
    } else {
      setNotifPermission('denied')
    }
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

      setDocuments(docs ?? [])
      setRooms(roomData ?? [])
      setAdahiInv(invData ?? null)
      setNotifications(notifData ?? [])
      setStep('portal')

      // Request push notification permission
      await enableNotifications(traveller.cpr_number)
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

  const logout = () => {
    setStep('login')
    setCpr('')
    setTraveller(null)
    setDocuments([])
    setRooms([])
    setAdahiInv(null)
    setAdahiRcp(null)
    setNotifications([])
    setError('')
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

              {/* Enable notifications banner */}
              {notifPermission === 'default' && (
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

              {/* iOS add to home screen banner */}
              {notifPermission === 'granted' && /iPhone|iPad|iPod/.test(navigator.userAgent) && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm font-medium text-amber-800 mb-1">📱 لاستلام الإشعارات على iPhone</p>
                  <p className="text-xs text-amber-700">اضغط على زر المشاركة <strong>⬆️</strong> في Safari ثم اختر <strong>"أضف إلى الشاشة الرئيسية"</strong></p>
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
                      </div>
                    ))}
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

      {/* Footer */}
      <div className="text-center py-4 text-xs text-gray-400">
        حملة العمار للحج والعمرة © 1447
      </div>
    </div>
  )
}
