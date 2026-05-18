// src/pages/NotificationsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Bell, Plus, Send, Trash2, CheckCircle2, Users } from 'lucide-react'

export default function NotificationsPage() {
  const qc = useQueryClient()
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState({ title: '', message: '' })
  const [sending, setSending] = useState<string | null>(null)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: tokenCount = 0 } = useQuery({
    queryKey: ['fcm-token-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('fcm_tokens')
        .select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const createNotification = useMutation({
    mutationFn: () => supabase.from('notifications').insert(form).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      setModal(false)
      setForm({ title: '', message: '' })
    },
  })

  const deleteNotification = useMutation({
    mutationFn: (id: string) => supabase.from('notifications').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      supabase.from('notifications').update({ is_active: !is_active }).eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Send push notification via Supabase Edge Function
  const sendPush = async (notif: any) => {
    setSending(notif.id)
    try {
      // Get all FCM tokens
      const { data: tokens } = await supabase.from('fcm_tokens').select('token')
      if (!tokens || tokens.length === 0) {
        alert('لا يوجد حجاج مشتركين في الإشعارات بعد')
        setSending(null)
        return
      }

      // Call Supabase Edge Function to send notifications
      const { error } = await supabase.functions.invoke('dynamic-action', {
        body: {
          title:   notif.title,
          message: notif.message,
          tokens:  tokens.map((t: any) => t.token),
        },
      })

      if (error) throw error

      // Mark as sent
      await supabase.from('notifications')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', notif.id)

      qc.invalidateQueries({ queryKey: ['notifications'] })
      alert(`تم إرسال الإشعار إلى ${tokens.length} حاج`)
    } catch (err) {
      console.error(err)
      alert('حدث خطأ في الإرسال')
    }
    setSending(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الإشعارات</h1>
          <p className="text-sm text-gray-500 mt-0.5">إرسال إشعارات للحجاج</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Users size={14} className="text-emerald-600" />
            <span className="text-sm text-emerald-700 font-medium">{tokenCount} حاج مشترك</span>
          </div>
          <button onClick={() => setModal(true)}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> إشعار جديد
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <p className="font-medium mb-1">كيف يعمل النظام؟</p>
        <p>عندما يفتح الحاج بوابته على <strong>alammar.app/pilgrim</strong> ويوافق على الإشعارات، يتم تسجيله تلقائياً. يمكنك بعد ذلك إرسال إشعارات تصلهم مباشرة على هواتفهم.</p>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          لا توجد إشعارات بعد
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n: any) => (
            <div key={n.id} className={`bg-white rounded-xl border shadow-sm p-4 ${n.is_active ? 'border-emerald-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{n.title}</p>
                    {n.is_active
                      ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">نشط</span>
                      : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">غير نشط</span>
                    }
                    {n.sent_at && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        <CheckCircle2 size={10} /> أُرسل
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleString('ar-BH')}
                    {n.sent_at && ` · أُرسل: ${new Date(n.sent_at).toLocaleString('ar-BH')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => sendPush(n)}
                    disabled={sending === n.id}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors">
                    <Send size={12} />
                    {sending === n.id ? 'جارٍ...' : 'إرسال'}
                  </button>
                  <button onClick={() => toggleActive.mutate({ id: n.id, is_active: n.is_active })}
                    className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    {n.is_active ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button onClick={() => window.confirm('حذف الإشعار؟') && deleteNotification.mutate(n.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add notification modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold">إشعار جديد</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">العنوان *</label>
              <input className={ic} value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="مثال: تنبيه مهم، موعد الحافلة..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نص الإشعار *</label>
              <textarea className={ic + ' resize-none'} rows={4}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="اكتب رسالتك هنا..." />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => createNotification.mutate()}
                disabled={createNotification.isPending || !form.title || !form.message}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                حفظ
              </button>
              <button onClick={() => { setModal(false); setForm({ title: '', message: '' }) }}
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
