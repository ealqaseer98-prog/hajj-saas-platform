// src/pages/DhabhPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  Landmark,
  Search,
  RefreshCw,
  CheckCircle2,
  X,
} from 'lucide-react'

type DhabhFilter = 'all' | 'pending' | 'completed'

type RitualRow = {
  traveller_id: string
  rami_completed: boolean
  rami_time: string | null
  dhabh_completed: boolean
  dhabh_time: string | null
  traveller: {
    id: string
    full_name_ar: string
    cpr_number: string
    room_assignments?: { room: { room_number: string } | null }[]
  } | null
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-BH', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function roomNumber(row: RitualRow): string {
  const assignments = row.traveller?.room_assignments
  if (!assignments?.length) return '—'
  const num = assignments[0]?.room?.room_number
  return num?.trim() || '—'
}

export default function DhabhPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DhabhFilter>('all')
  const [confirmTravellerId, setConfirmTravellerId] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dhabh-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hajj_rituals')
        .select(
          `
          traveller_id,
          rami_completed,
          rami_time,
          dhabh_completed,
          dhabh_time,
          traveller:travellers(
            id,
            full_name_ar,
            cpr_number,
            room_assignments(room:rooms(room_number))
          )
        `
        )
        .eq('rami_completed', true)
        .order('rami_time', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data ?? []) as RitualRow[]
    },
  })

  const markDhabh = useMutation({
    mutationFn: async (travellerId: string) => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('hajj_rituals')
        .update({
          dhabh_completed: true,
          dhabh_time: now,
          updated_at: now,
        })
        .eq('traveller_id', travellerId)
        .eq('rami_completed', true)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dhabh-queue'] })
      setConfirmTravellerId(null)
      setConfirmName('')
    },
  })

  const pendingCount = rows.filter(r => !r.dhabh_completed).length
  const completedCount = rows.filter(r => r.dhabh_completed).length

  const filtered = rows.filter(row => {
    const name = row.traveller?.full_name_ar ?? ''
    const cpr = row.traveller?.cpr_number ?? ''
    const matchSearch =
      !search.trim() ||
      name.includes(search) ||
      cpr.includes(search)
    const matchFilter =
      filter === 'all'
        ? true
        : filter === 'pending'
          ? !row.dhabh_completed
          : row.dhabh_completed
    return matchSearch && matchFilter
  })

  const openConfirm = (row: RitualRow) => {
    setConfirmTravellerId(row.traveller_id)
    setConfirmName(row.traveller?.full_name_ar ?? '')
  }

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Landmark className="text-emerald-700" size={26} />
            الذبح
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            حجاج أتمّوا رمي الجمرات — تسجيل إتمام الذبح
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-xs text-amber-600 mt-0.5">في الانتظار</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{completedCount}</p>
          <p className="text-xs text-green-600 mt-0.5">تم الذبح</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ابحث بالاسم أو رقم البطاقة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
          {(
            [
              ['all', 'الكل'],
              ['pending', 'في الانتظار'],
              ['completed', 'تم الذبح'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {markDhabh.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          تعذّر التحديث. تأكد من تطبيق جدول hajj_rituals في Supabase.
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            {rows.length === 0
              ? 'لا يوجد حجاج أتمّوا رمي الجمرات بعد'
              : 'لا توجد نتائج'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(row => {
              const done = row.dhabh_completed
              return (
                <div
                  key={row.traveller_id}
                  className={`p-4 flex flex-wrap items-center gap-3 ${
                    done ? 'bg-green-50/40' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800">{row.traveller?.full_name_ar ?? '—'}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                      {row.traveller?.cpr_number ?? '—'}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                      <span>غرفة: {roomNumber(row)}</span>
                      <span>رمي الجمرات: {formatDateTime(row.rami_time)}</span>
                      {done && (
                        <span className="text-green-700 font-medium">
                          الذبح: {formatDateTime(row.dhabh_time)}
                        </span>
                      )}
                    </div>
                  </div>

                  {done ? (
                    <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium shrink-0">
                      <CheckCircle2 size={18} />
                      تم الذبح
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openConfirm(row)}
                      disabled={markDhabh.isPending}
                      className="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      تم الذبح ✓
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmTravellerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-100">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-800">تأكيد الذبح</h2>
              <button
                type="button"
                onClick={() => {
                  setConfirmTravellerId(null)
                  setConfirmName('')
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              هل تم ذبح أضحية <strong>{confirmName}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
                disabled={markDhabh.isPending}
                onClick={() => {
                  setConfirmTravellerId(null)
                  setConfirmName('')
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                disabled={markDhabh.isPending}
                onClick={() => markDhabh.mutate(confirmTravellerId)}
              >
                {markDhabh.isPending ? 'جارٍ الحفظ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
