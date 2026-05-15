// src/pages/VisaTrackingPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle, ChevronDown, History, Filter } from 'lucide-react'
import type { Traveller, VisaStatus, PackageType } from '../types'
import { useAuthStore } from '../store/authStore'
import { canManageVisa } from '../lib/permissions'

const STATUS_CFG: Record<VisaStatus, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  pending:  { label: 'في الانتظار', icon: <Clock size={14} />,       bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  approved: { label: 'موافق عليه',  icon: <CheckCircle2 size={14} />, bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  rejected: { label: 'مرفوض',       icon: <XCircle size={14} />,      bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'   },
}

const PACKAGE_LABELS: Record<PackageType, string> = {
  barr: 'البر',
  tayaran_dammam: 'طيران - الدمام',
  tayaran_bahrain: 'طيران - البحرين',
  tasreeh_only: 'فقط تصريح',
}

const TASREEH_SOURCE_LABELS: Record<'bahrain' | 'saudi', string> = {
  bahrain: 'البحرين',
  saudi: 'السعودية',
  other: 'أخرى',
}

export default function VisaTrackingPage() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canEdit = canManageVisa(user?.role)

  const [filterStatus, setFilterStatus] = useState<VisaStatus | 'all'>('all')
  const [historyModal, setHistoryModal]  = useState<string | null>(null) // traveller id
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus]     = useState<VisaStatus>('approved')
  const [bulkNotes, setBulkNotes]       = useState('')
  const [search, setSearch]             = useState('')

  const { data: travellers = [], isLoading } = useQuery({
    queryKey: ['visa-travellers', filterStatus],
    queryFn: async () => {
      const baseFields = 'id, full_name_ar, full_name_en, cpr_number, visa_status, gender, phone, tasreeh_source'
      const fieldsWithPackage = `${baseFields}, package_type`

      let q = supabase.from('travellers').select(fieldsWithPackage).order('full_name_ar')
      if (filterStatus !== 'all') q = q.eq('visa_status', filterStatus)
      const { data, error } = await q

      // Fallback for environments where package_type is not yet present in DB.
      if (error) {
        let fallbackQ = supabase.from('travellers').select(baseFields).order('full_name_ar')
        if (filterStatus !== 'all') fallbackQ = fallbackQ.eq('visa_status', filterStatus)
        const { data: fallbackData, error: fallbackError } = await fallbackQ
        if (fallbackError) throw fallbackError
        return ((fallbackData ?? []).map(t => ({ ...t, package_type: null })) as Traveller[])
      }

      return (data ?? []) as Traveller[]
    },
  })

  const { data: allTravellers = [] } = useQuery({
    queryKey: ['visa-travellers-all-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('travellers').select('id, visa_status')
      return (data ?? []) as Pick<Traveller, 'id' | 'visa_status'>[]
    },
  })

  const searchTerm = search.trim().toLowerCase()
  const filteredTravellers = searchTerm
    ? travellers.filter(t => (t.full_name_ar ?? '').toLowerCase().includes(searchTerm))
    : travellers

  const { data: history = [] } = useQuery({
    queryKey: ['visa-history', historyModal],
    queryFn: async () => {
      const { data } = await supabase
        .from('visa_history')
        .select('*')
        .eq('traveller_id', historyModal!)
        .order('changed_at', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!historyModal,
  })

  const updateVisa = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: VisaStatus; notes?: string }) => {
      await supabase.from('travellers')
        .update({ visa_status: status })
        .eq('id', id).throwOnError()
      // manually log since trigger only fires on UPDATE
      await supabase.from('visa_history').insert({
        traveller_id: id, status, notes: notes ?? null, changed_by: user?.username ?? null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visa-travellers'] })
      qc.invalidateQueries({ queryKey: ['visa-history'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const ids = Array.from(bulkSelected)
      for (const id of ids) {
        await supabase.from('travellers').update({ visa_status: bulkStatus }).eq('id', id).throwOnError()
        await supabase.from('visa_history').insert({
          traveller_id: id, status: bulkStatus,
          notes: bulkNotes || null, changed_by: user?.username ?? null,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visa-travellers'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setBulkSelected(new Set())
      setBulkNotes('')
    },
  })

  const counts = {
    pending:  allTravellers.filter(t => t.visa_status === 'pending').length,
    approved: allTravellers.filter(t => t.visa_status === 'approved').length,
    rejected: allTravellers.filter(t => t.visa_status === 'rejected').length,
  }

  const toggleBulk = (id: string) => {
    setBulkSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const historyTraveller = travellers.find(t => t.id === historyModal)

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">تتبع التصاريح</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة ومتابعة حالات التصريح لجميع الحجاج</p>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(STATUS_CFG) as [VisaStatus, typeof STATUS_CFG[VisaStatus]][]).map(([key, cfg]) => (
          <button key={key}
            onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
            className={`rounded-xl border p-4 text-right transition-all ${
              filterStatus === key ? `${cfg.bg} ${cfg.border} shadow-sm` : 'bg-white border-gray-100 hover:shadow-sm'
            }`}>
            <div className={`flex items-center gap-2 mb-1 ${cfg.text}`}>
              {cfg.icon}
              <span className="text-xs font-medium">{cfg.label}</span>
            </div>
            <p className={`text-2xl font-bold ${cfg.text}`}>{counts[key]}</p>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {canEdit && bulkSelected.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-stretch md:items-center gap-2 md:gap-3">
          <span className="text-sm font-medium text-emerald-800 w-full md:w-auto">{bulkSelected.size} حاج محدد</span>
          <select className="border border-emerald-300 rounded-lg px-2 py-1.5 text-sm bg-white w-full md:w-auto"
            value={bulkStatus} onChange={e => setBulkStatus(e.target.value as VisaStatus)}>
            <option value="approved">موافق عليه</option>
            <option value="pending">في الانتظار</option>
            <option value="rejected">مرفوض</option>
          </select>
          <input className="border border-emerald-300 rounded-lg px-2 py-1.5 text-sm bg-white w-full md:flex-1 min-w-0 md:min-w-[150px]"
            placeholder="ملاحظات (اختياري)" value={bulkNotes}
            onChange={e => setBulkNotes(e.target.value)} />
          <button onClick={() => bulkUpdate.mutate()} disabled={bulkUpdate.isPending}
            className="bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 w-full md:w-auto">
            {bulkUpdate.isPending ? 'جارٍ...' : 'تطبيق'}
          </button>
          <button onClick={() => setBulkSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 w-full md:w-auto text-center">إلغاء</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([['all','الكل'], ['pending','في الانتظار'], ['approved','موافق'], ['rejected','مرفوضة']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterStatus === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      <div>
        <input
          type="text"
          placeholder="ابحث بالاسم العربي..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:w-80 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Table / Mobile Cards */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
        ) : filteredTravellers.length === 0 ? (
          <div className="p-10 text-center text-gray-400">لا يوجد حاجون</div>
        ) : (
          <>
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {canEdit && (
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" className="rounded"
                      checked={bulkSelected.size === filteredTravellers.length && filteredTravellers.length > 0}
                      onChange={e => setBulkSelected(e.target.checked ? new Set(filteredTravellers.map(t => t.id)) : new Set())} />
                  </th>
                )}
                <th className="text-right px-4 py-3 font-medium text-gray-600">الحاج</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">رقم البطاقة</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">مصدر التصريح</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الباقة</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">الحالة</th>
                {canEdit && (
                  <th className="text-right px-4 py-3 font-medium text-gray-600">تغيير الحالة</th>
                )}
                <th className="px-4 py-3 font-medium text-gray-600">السجل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTravellers.map(t => {
                const cfg = STATUS_CFG[t.visa_status]
                return (
                  <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${bulkSelected.has(t.id) ? 'bg-emerald-50' : ''}`}>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <input type="checkbox" className="rounded" checked={bulkSelected.has(t.id)}
                          onChange={() => toggleBulk(t.id)} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <button className="text-right hover:text-emerald-700" onClick={() => navigate(`/travellers/${t.id}`)}>
                        <p className="font-medium text-gray-800 flex items-center gap-1">
                          {t.gender === 'male' ? '👨' : t.gender === 'female' ? '🧕' : '👤'}
                          {t.full_name_ar}
                        </p>
                        <p className="text-xs text-gray-400">{t.full_name_en}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{t.cpr_number}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.tasreeh_source === 'bahrain' || t.tasreeh_source === 'saudi'
                        ? TASREEH_SOURCE_LABELS[t.tasreeh_source]
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.package_type ? PACKAGE_LABELS[t.package_type] : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <select
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                          value={t.visa_status}
                          onChange={e => updateVisa.mutate({ id: t.id, status: e.target.value as VisaStatus })}>
                          <option value="pending">في الانتظار</option>
                          <option value="approved">موافق عليه</option>
                          <option value="rejected">مرفوض</option>
                        </select>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <button onClick={() => setHistoryModal(t.id)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="عرض السجل">
                        <History size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="md:hidden p-3 space-y-3">
            {filteredTravellers.map(t => {
              const cfg = STATUS_CFG[t.visa_status]
              return (
                <div key={t.id} className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-right hover:text-emerald-700" onClick={() => navigate(`/travellers/${t.id}`)}>
                      <p className="font-medium text-gray-800">{t.full_name_ar}</p>
                    </button>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5 text-sm text-gray-600">
                    <p><span className="text-gray-500">رقم البطاقة: </span><span className="font-mono">{t.cpr_number}</span></p>
                    <p><span className="text-gray-500">الجنس: </span>{t.gender === 'male' ? 'رجل' : t.gender === 'female' ? 'امرأة' : '—'}</p>
                    <p>
                      <span className="text-gray-500">مصدر التصريح: </span>
                      {t.tasreeh_source === 'bahrain' || t.tasreeh_source === 'saudi'
                        ? TASREEH_SOURCE_LABELS[t.tasreeh_source]
                        : '—'}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">تغيير الحالة</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        value={t.visa_status}
                        onChange={e => updateVisa.mutate({ id: t.id, status: e.target.value as VisaStatus })}>
                        <option value="pending">في الانتظار</option>
                        <option value="approved">موافق عليه</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button onClick={() => setHistoryModal(t.id)}
                      className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="عرض السجل">
                      <History size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      {/* History modal */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-center md:p-4 z-50">
          <div className="bg-white w-full h-full rounded-none p-6 space-y-4 overflow-y-auto md:h-auto md:max-w-md md:rounded-2xl md:shadow-2xl md:max-h-[80vh]" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                سجل التصريح — {historyTraveller?.full_name_ar}
              </h2>
              <button onClick={() => setHistoryModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">لا يوجد سجل تغييرات</p>
            ) : (
              <div className="space-y-3">
                {history.map((h: any) => {
                  const cfg = STATUS_CFG[h.status as VisaStatus]
                  return (
                    <div key={h.id} className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                      <span className={cfg.text}>{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</p>
                        {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(h.changed_at).toLocaleString('ar-BH')}
                          {h.changed_by && <span className="mr-2">— {h.changed_by}</span>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
