// src/pages/RoomRequestsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MessageSquare, CheckCircle2, Clock, AlertCircle, RefreshCw, X } from 'lucide-react'

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

export default function RoomRequestsPage() {
  const qc = useQueryClient()
  const [filter, setFilter]   = useState<'all' | 'new' | 'in_progress' | 'closed'>('all')
  const [selected, setSelected] = useState<any>(null)
  const [adminNotes, setAdminNotes] = useState('')

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
        <button onClick={() => refetch()}
          className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm">
          <RefreshCw size={14} /> تحديث
        </button>
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
                onClick={() => { setSelected(r); setAdminNotes(r.admin_notes ?? '') }}>
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

      {/* Request detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">تفاصيل الطلب</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
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
                  disabled={selected.status === 'in_progress' || updateRequest.isPending}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  قيد المعالجة
                </button>
                <button onClick={() => updateRequest.mutate({ id: selected.id, status: 'closed', notes: adminNotes })}
                  disabled={selected.status === 'closed' || updateRequest.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  إغلاق الطلب
                </button>
                <button onClick={() => updateRequest.mutate({ id: selected.id, status: 'new', notes: adminNotes })}
                  disabled={selected.status === 'new' || updateRequest.isPending}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                  إعادة فتح
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
