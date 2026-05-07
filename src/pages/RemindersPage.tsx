// src/pages/RemindersPage.tsx
// Payment reminders + WhatsApp message composer
// WhatsApp integration uses wa.me deep link (free, no API needed)
// For real API: integrate Twilio WhatsApp or Meta WhatsApp Business API
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  MessageSquare, Bell, Plus, Check, X, Send, Clock,
  Phone, ChevronDown, AlertCircle, CheckCircle2
} from 'lucide-react'
import type { Invoice, Traveller } from '../types'

type ReminderStatus = 'pending' | 'sent' | 'dismissed'

// ── WhatsApp message templates ──────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'payment_reminder',
    label: 'تذكير بالدفع',
    text: (name: string, amount: string, date: string) =>
      `السلام عليكم ${name}،\nنود تذكيركم بأن لديكم مبلغ ${amount} دينار بحريني مستحق السداد بتاريخ ${date}.\nيرجى التواصل معنا للتسوية.\nشكراً لكم.`,
  },
  {
    id: 'visa_approved',
    label: 'موافقة على التصريح',
    text: (name: string) =>
      `السلام عليكم ${name}،\nيسعدنا إبلاغكم بأنه تمت الموافقة على تصريحكم بنجاح. 🎉\nيرجى التواصل معنا لاستكمال الإجراءات.\nبالتوفيق.`,
  },
  {
    id: 'trip_reminder',
    label: 'تذكير بالرحلة',
    text: (name: string, tripName: string, date: string) =>
      `السلام عليكم ${name}،\nتذكير بأن موعد رحلتكم (${tripName}) هو ${date}.\nيرجى التأكد من جاهزية جميع المستندات.\nرحلة مباركة.`,
  },
  {
    id: 'general',
    label: 'رسالة عامة',
    text: () => '',
  },
]

export default function RemindersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'reminders' | 'whatsapp'>('reminders')

  // ── WhatsApp state ────────────────────────────────────────────────────────
  const [selectedTraveller, setSelectedTraveller] = useState<Traveller | null>(null)
  const [selectedTemplate, setSelectedTemplate]   = useState(TEMPLATES[0].id)
  const [messageText, setMessageText]             = useState('')
  const [customPhone, setCustomPhone]             = useState('')

  // ── Reminders state ───────────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(false)
  const [newReminder, setNewReminder] = useState({
    invoice_id: '', traveller_id: '', reminder_date: '', method: 'whatsapp', notes: '',
  })

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payment_reminders')
        .select('*, invoice:invoices(invoice_number, amount, amount_paid), traveller:travellers(full_name_ar, phone)')
        .order('reminder_date')
      return (data ?? []) as any[]
    },
  })

  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('travellers').select('*').order('full_name_ar')
      return (data ?? []) as Traveller[]
    },
  })

  const { data: unpaidInvoices = [] } = useQuery({
    queryKey: ['unpaid-invoices-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, amount, amount_paid, due_date, traveller:travellers(full_name_ar)')
        .in('status', ['unpaid', 'partial'])
        .order('due_date')
      return (data ?? []) as any[]
    },
  })

  const { data: waLogs = [] } = useQuery({
    queryKey: ['wa-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_log')
        .select('*, traveller:travellers(full_name_ar)')
        .order('sent_at', { ascending: false })
        .limit(20)
      return (data ?? []) as any[]
    },
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addReminder = useMutation({
    mutationFn: () => supabase.from('payment_reminders').insert(newReminder).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      setAddModal(false)
      setNewReminder({ invoice_id: '', traveller_id: '', reminder_date: '', method: 'whatsapp', notes: '' })
    },
  })

  const updateReminderStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReminderStatus }) =>
      supabase.from('payment_reminders').update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null }).eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const deleteReminder = useMutation({
    mutationFn: (id: string) => supabase.from('payment_reminders').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const logWhatsApp = useMutation({
    mutationFn: ({ travellerId, phone, message }: { travellerId: string | null; phone: string; message: string }) =>
      supabase.from('whatsapp_log').insert({
        traveller_id: travellerId, phone, message, status: 'sent',
      }).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-logs'] }),
  })

  // ── WhatsApp send ─────────────────────────────────────────────────────────
  const sendWhatsApp = () => {
    const phone = (selectedTraveller?.phone ?? customPhone).replace(/\D/g, '')
    if (!phone || !messageText.trim()) return

    // Log the send
    logWhatsApp.mutate({
      travellerId: selectedTraveller?.id ?? null,
      phone, message: messageText,
    })

    // Open wa.me link
    const encoded = encodeURIComponent(messageText)
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank')
  }

  // Fill template
  const applyTemplate = (templateId: string) => {
    const t = TEMPLATES.find(t => t.id === templateId)
    if (!t || !selectedTraveller) return
    const name = selectedTraveller.full_name_ar
    // Get first upcoming unpaid invoice for this traveller
    const inv = unpaidInvoices.find((i: any) => i.traveller?.id === selectedTraveller?.id)
    const amount = inv ? (Number(inv.amount) - Number(inv.amount_paid)).toFixed(3) : '—'
    const date   = inv?.due_date ?? '—'
    setMessageText(t.text(name, amount, date) as string)
  }

  const pendingCount   = reminders.filter((r: any) => r.status === 'pending').length
  const overdueCount   = reminders.filter((r: any) => r.status === 'pending' && r.reminder_date < new Date().toISOString().slice(0,10)).length

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">التذكيرات وواتساب</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة تذكيرات الدفع وإرسال رسائل واتساب</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <Bell size={14} className="text-amber-500" />
            <span className="text-sm text-amber-700">{pendingCount} تذكير معلق</span>
            {overdueCount > 0 && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">{overdueCount} متأخر</span>}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          ['reminders', 'تذكيرات الدفع', <Bell size={14} />],
          ['whatsapp',  'واتساب',        <MessageSquare size={14} />],
        ] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── REMINDERS TAB ── */}
      {tab === 'reminders' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setAddModal(true)}
              className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus size={15} /> تذكير جديد
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
            ) : reminders.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Bell size={36} className="mx-auto mb-3 opacity-30" />
                لا توجد تذكيرات
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحاج</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الفاتورة</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الطريقة</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reminders.map((r: any) => {
                    const isOverdue = r.status === 'pending' && r.reminder_date < new Date().toISOString().slice(0,10)
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{r.traveller?.full_name_ar ?? '—'}</p>
                          {r.traveller?.phone && (
                            <p className="text-xs text-gray-400 font-mono">{r.traveller.phone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.invoice?.invoice_number ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {r.reminder_date} {isOverdue && '⚠️'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.method === 'whatsapp'
                            ? <span className="text-green-600 flex items-center gap-1"><MessageSquare size={13} /> واتساب</span>
                            : <span className="text-gray-500">{r.method}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {r.status === 'pending' && r.traveller?.phone && (
                              <button
                                onClick={() => {
                                  // Quick send via WhatsApp
                                  const phone = r.traveller.phone.replace(/\D/g, '')
                                  const inv   = unpaidInvoices.find((i: any) => i.id === r.invoice_id)
                                  const amount = inv ? (Number(inv.amount) - Number(inv.amount_paid)).toFixed(3) : '—'
                                  const msg = `السلام عليكم ${r.traveller.full_name_ar}،\nتذكير بمبلغ ${amount} BHD مستحق بتاريخ ${r.reminder_date}.`
                                  logWhatsApp.mutate({ travellerId: r.traveller_id, phone, message: msg })
                                  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                                  updateReminderStatus.mutate({ id: r.id, status: 'sent' })
                                }}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg"
                                title="إرسال واتساب الآن">
                                <Send size={13} />
                              </button>
                            )}
                            {r.status === 'pending' && (
                              <button onClick={() => updateReminderStatus.mutate({ id: r.id, status: 'dismissed' })}
                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                title="تجاهل">
                                <X size={13} />
                              </button>
                            )}
                            <button onClick={() => deleteReminder.mutate(r.id)}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Add reminder modal */}
          {addModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" dir="rtl">
                <h2 className="text-lg font-bold">تذكير جديد</h2>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الحاج *</label>
                  <select className={ic} value={newReminder.traveller_id}
                    onChange={e => setNewReminder(r => ({ ...r, traveller_id: e.target.value }))}>
                    <option value="">— اختر حاجًا —</option>
                    {travellers.map(t => <option key={t.id} value={t.id}>{t.full_name_ar}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الفاتورة</label>
                  <select className={ic} value={newReminder.invoice_id}
                    onChange={e => setNewReminder(r => ({ ...r, invoice_id: e.target.value }))}>
                    <option value="">— بدون فاتورة محددة —</option>
                    {unpaidInvoices.filter((i: any) => !newReminder.traveller_id || i.traveller_id === newReminder.traveller_id)
                      .map((i: any) => <option key={i.id} value={i.id}>{i.invoice_number} — {(Number(i.amount)-Number(i.amount_paid)).toFixed(3)} BHD</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">تاريخ التذكير *</label>
                  <input className={ic} type="date" value={newReminder.reminder_date}
                    onChange={e => setNewReminder(r => ({ ...r, reminder_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">طريقة الإرسال</label>
                  <select className={ic} value={newReminder.method}
                    onChange={e => setNewReminder(r => ({ ...r, method: e.target.value }))}>
                    <option value="whatsapp">واتساب</option>
                    <option value="email">بريد إلكتروني</option>
                    <option value="manual">يدوي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
                  <input className={ic} value={newReminder.notes}
                    onChange={e => setNewReminder(r => ({ ...r, notes: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => addReminder.mutate()} disabled={addReminder.isPending || !newReminder.traveller_id || !newReminder.reminder_date}
                    className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    حفظ
                  </button>
                  <button onClick={() => setAddModal(false)}
                    className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">إلغاء</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── WHATSAPP TAB ── */}
      {tab === 'whatsapp' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Composer */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MessageSquare size={16} className="text-green-500" /> إرسال رسالة واتساب
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">اختر حاجًا</label>
              <select className={ic}
                value={selectedTraveller?.id ?? ''}
                onChange={e => {
                  const t = travellers.find(t => t.id === e.target.value) ?? null
                  setSelectedTraveller(t)
                  setMessageText('')
                }}>
                <option value="">— اختر حاجًا —</option>
                {travellers.map(t => <option key={t.id} value={t.id}>{t.full_name_ar} {t.phone ? `(${t.phone})` : ''}</option>)}
              </select>
            </div>

            {!selectedTraveller && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">أو أدخل رقم الهاتف مباشرة</label>
                <input className={ic} dir="ltr" placeholder="+973 3XXXXXXX" value={customPhone}
                  onChange={e => setCustomPhone(e.target.value)} />
              </div>
            )}

            {/* Template selector */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">قالب الرسالة</label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id}
                    onClick={() => { setSelectedTemplate(t.id); applyTemplate(t.id) }}
                    className={`text-xs px-2 py-2 rounded-lg border text-right transition-colors ${
                      selectedTemplate === t.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نص الرسالة *</label>
              <textarea className={ic + ' resize-none'} rows={6}
                placeholder="اكتب رسالتك هنا..."
                value={messageText}
                onChange={e => setMessageText(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">{messageText.length} حرف</p>
            </div>

            <button
              onClick={sendWhatsApp}
              disabled={(!selectedTraveller?.phone && !customPhone) || !messageText.trim()}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
              <MessageSquare size={16} />
              فتح واتساب وإرسال
            </button>
            <p className="text-xs text-gray-400 text-center">سيتم فتح تطبيق واتساب مع الرسالة المُعدَّة</p>
          </div>

          {/* WhatsApp log */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">سجل الرسائل المُرسَلة</h2>
            {waLogs.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">لا توجد رسائل مُرسَلة بعد</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {waLogs.map((log: any) => (
                  <div key={log.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {log.traveller?.full_name_ar ?? log.phone}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{log.phone}</p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(log.sent_at).toLocaleDateString('ar-BH')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap line-clamp-3">
                      {log.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ReminderStatus }) {
  const cfg = {
    pending:   { label: 'معلق',    cls: 'bg-amber-100 text-amber-700',  icon: <Clock size={11} /> },
    sent:      { label: 'مُرسَل', cls: 'bg-green-100 text-green-700',  icon: <CheckCircle2 size={11} /> },
    dismissed: { label: 'متجاهل', cls: 'bg-gray-100 text-gray-500',    icon: <X size={11} /> },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
