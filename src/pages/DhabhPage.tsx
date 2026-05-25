// src/pages/DhabhPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { isAdmin } from '../lib/permissions'
import {
  Landmark,
  Search,
  RefreshCw,
  CheckCircle2,
  X,
  Undo2,
  Printer,
} from 'lucide-react'

const LOGO_URL =
  'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'

type PrintPerson = {
  full_name_ar: string
  cpr_number: string
  room_number: string
  gender: string | null
}

type ConfirmAction =
  | { type: 'dhabh'; travellerId: string; name: string }
  | { type: 'undo-dhabh'; travellerId: string; name: string }
  | { type: 'undo-rami'; travellerId: string; name: string }

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

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function roomFromAssignments(assignments: { room: { room_number: string } | null }[] | undefined) {
  if (!assignments?.length) return '—'
  return assignments[0]?.room?.room_number?.trim() || '—'
}

function sortByName(list: PrintPerson[]) {
  return [...list].sort((a, b) =>
    (a.full_name_ar ?? '').localeCompare(b.full_name_ar ?? '', 'ar')
  )
}

function splitByGender(list: PrintPerson[]) {
  const sorted = sortByName(list)
  return {
    males: sorted.filter(p => p.gender === 'male'),
    females: sorted.filter(p => p.gender === 'female'),
    other: sorted.filter(p => p.gender !== 'male' && p.gender !== 'female'),
  }
}

function genderCounts(list: PrintPerson[]) {
  return {
    male: list.filter(p => p.gender === 'male').length,
    female: list.filter(p => p.gender === 'female').length,
  }
}

async function fetchReportPeople(): Promise<{
  awaitingRami: PrintPerson[]
  awaitingDhabh: PrintPerson[]
  completed: PrintPerson[]
}> {
  const { data, error } = await supabase
    .from('travellers')
    .select(
      `
      id,
      full_name_ar,
      cpr_number,
      gender,
      hajj_rituals(rami_completed, dhabh_completed),
      room_assignments(room:rooms(room_number))
    `
    )
    .order('full_name_ar')

  if (error) throw error

  const awaitingRami: PrintPerson[] = []
  const awaitingDhabh: PrintPerson[] = []
  const completed: PrintPerson[] = []

  for (const row of data ?? []) {
    const ritualsRaw = (row as any).hajj_rituals
    const rituals = Array.isArray(ritualsRaw) ? ritualsRaw[0] : ritualsRaw
    const rami = rituals?.rami_completed === true
    const dhabh = rituals?.dhabh_completed === true

    const person: PrintPerson = {
      full_name_ar: (row as any).full_name_ar ?? '—',
      cpr_number: (row as any).cpr_number ?? '—',
      room_number: roomFromAssignments((row as any).room_assignments),
      gender: (row as any).gender ?? null,
    }

    if (dhabh) completed.push(person)
    else if (rami) awaitingDhabh.push(person)
    else awaitingRami.push(person)
  }

  return { awaitingRami, awaitingDhabh, completed }
}

function buildGenderTable(title: string, list: PrintPerson[], startNum: number): string {
  if (list.length === 0) {
    return `<p class="gender-label">${escapeHtml(title)}: لا يوجد</p>`
  }
  const rows = list
    .map(
      (p, i) => `<tr>
        <td>${startNum + i}</td>
        <td>${escapeHtml(p.full_name_ar)}</td>
        <td>${escapeHtml(p.cpr_number)}</td>
        <td>${escapeHtml(p.room_number)}</td>
      </tr>`
    )
    .join('')
  return `
    <p class="gender-label">${escapeHtml(title)} (${list.length})</p>
    <table>
      <thead>
        <tr><th>#</th><th>الاسم</th><th>رقم البطاقة</th><th>رقم الغرفة</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildReportSection(sectionTitle: string, people: PrintPerson[]): string {
  const { males, females, other } = splitByGender(people)
  const counts = genderCounts(people)
  let index = 1
  const maleTable = buildGenderTable('ذكور', males, index)
  index += males.length
  const femaleTable = buildGenderTable('إناث', females, index)
  index += females.length
  const otherTable =
    other.length > 0 ? buildGenderTable('غير محدد', other, index) : ''

  return `
    <section class="report-section">
      <h2 class="section-title">${escapeHtml(sectionTitle)}</h2>
      <p class="section-counts">
        الإجمالي: <strong>${people.length}</strong>
        — ذكور: <strong>${counts.male}</strong>
        — إناث: <strong>${counts.female}</strong>
      </p>
      ${maleTable}
      ${femaleTable}
      ${otherTable}
    </section>`
}

export default function DhabhPage() {
  const qc = useQueryClient()
  const authUser = useAuthStore(s => s.user)
  const showAdminUndo = isAdmin(authUser?.role)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DhabhFilter>('all')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [printing, setPrinting] = useState(false)

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
      setConfirmAction(null)
    },
  })

  const undoDhabh = useMutation({
    mutationFn: async (travellerId: string) => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('hajj_rituals')
        .update({
          dhabh_completed: false,
          dhabh_time: null,
          updated_at: now,
        })
        .eq('traveller_id', travellerId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dhabh-queue'] })
      setConfirmAction(null)
    },
  })

  const undoRami = useMutation({
    mutationFn: async (travellerId: string) => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('hajj_rituals')
        .update({
          rami_completed: false,
          rami_time: null,
          dhabh_completed: false,
          dhabh_time: null,
          updated_at: now,
        })
        .eq('traveller_id', travellerId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dhabh-queue'] })
      setConfirmAction(null)
    },
  })

  const actionPending =
    markDhabh.isPending || undoDhabh.isPending || undoRami.isPending

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

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'dhabh') markDhabh.mutate(confirmAction.travellerId)
    else if (confirmAction.type === 'undo-dhabh') undoDhabh.mutate(confirmAction.travellerId)
    else if (confirmAction.type === 'undo-rami') undoRami.mutate(confirmAction.travellerId)
  }

  const printReport = async () => {
    setPrinting(true)
    try {
      const { awaitingRami, awaitingDhabh, completed } = await fetchReportPeople()
      const date = new Date().toLocaleDateString('ar-BH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      const win = window.open('', '_blank')
      if (!win) return

      win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير الذبح - حملة العمار 1447 هـ</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
    body { margin: 12px; direction: rtl; font-size: 13px; color: #111; }
    .logo-wrap { text-align: center; margin-bottom: 10px; }
    .logo { height: 72px; object-fit: contain; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .print-date { font-size: 12px; color: #555; margin: 0; }
    .report-section { margin-bottom: 28px; page-break-inside: avoid; }
    .section-title {
      font-size: 16px; margin: 0 0 8px; padding-bottom: 6px;
      border-bottom: 2px solid #333;
    }
    .section-counts { font-size: 12px; color: #444; margin: 0 0 12px; }
    .gender-label { font-size: 13px; font-weight: bold; margin: 14px 0 6px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: right; }
    th { background: #f0f0f0; font-weight: bold; font-size: 12px; }
    @media print {
      body { margin: 5mm; }
      .report-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="logo-wrap">
    <img class="logo" src="${LOGO_URL}" alt="Alammar Logo" crossorigin="anonymous" />
  </div>
  <div class="header">
    <h1>تقرير الذبح - حملة العمار 1447 هـ</h1>
    <p class="print-date">تاريخ الطباعة: ${escapeHtml(date)}</p>
  </div>
  ${buildReportSection('في انتظار رمي الجمرات', awaitingRami)}
  ${buildReportSection('أتموا الرمي - في انتظار الذبح', awaitingDhabh)}
  ${buildReportSection('تم الذبح - مكتمل', completed)}
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1200); }</script>
</body>
</html>`)
      win.document.close()
    } catch {
      alert('تعذّر تحميل بيانات التقرير')
    } finally {
      setPrinting(false)
    }
  }

  const confirmCopy = (action: ConfirmAction) => {
    if (action.type === 'dhabh') {
      return {
        title: 'تأكيد الذبح',
        body: (
          <>
            هل تم ذبح أضحية <strong>{action.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء إلا من قبل
            المسؤول.
          </>
        ),
        confirmLabel: 'تأكيد',
        confirmClass: 'bg-emerald-700 hover:bg-emerald-800',
      }
    }
    if (action.type === 'undo-dhabh') {
      return {
        title: 'تراجع عن الذبح',
        body: (
          <>
            هل تريد التراجع عن تسجيل الذبح لـ <strong>{action.name}</strong>؟ سيعود الحاج إلى قائمة
            الانتظار.
          </>
        ),
        confirmLabel: 'تراجع عن الذبح',
        confirmClass: 'bg-amber-600 hover:bg-amber-700',
      }
    }
    return {
      title: 'تراجع عن الرمي',
      body: (
        <>
          هل تريد التراجع عن تسجيل رمي الجمرات لـ <strong>{action.name}</strong>؟ سيتم إلغاء الذبح
          أيضاً وإزالة الحاج من هذه القائمة.
        </>
      ),
      confirmLabel: 'تراجع عن الرمي',
      confirmClass: 'bg-red-600 hover:bg-red-700',
    }
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={printReport}
            disabled={printing}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Printer size={16} />
            {printing ? 'جارٍ التحميل...' : 'طباعة التقرير'}
          </button>
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

      {(markDhabh.isError || undoDhabh.isError || undoRami.isError) && (
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

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {done ? (
                      <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium px-1">
                        <CheckCircle2 size={18} />
                        تم الذبح
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            type: 'dhabh',
                            travellerId: row.traveller_id,
                            name: row.traveller?.full_name_ar ?? '',
                          })
                        }
                        disabled={actionPending}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        تم الذبح ✓
                      </button>
                    )}
                    {showAdminUndo && (
                      <div className="flex flex-wrap gap-2">
                        {row.rami_completed && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                type: 'undo-rami',
                                travellerId: row.traveller_id,
                                name: row.traveller?.full_name_ar ?? '',
                              })
                            }
                            disabled={actionPending}
                            className="flex items-center gap-1.5 border border-red-200 text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            <Undo2 size={14} />
                            تراجع عن الرمي
                          </button>
                        )}
                        {done && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmAction({
                                type: 'undo-dhabh',
                                travellerId: row.traveller_id,
                                name: row.traveller?.full_name_ar ?? '',
                              })
                            }
                            disabled={actionPending}
                            className="flex items-center gap-1.5 border border-amber-200 text-amber-800 hover:bg-amber-50 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                          >
                            <Undo2 size={14} />
                            تراجع عن الذبح
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmAction && (() => {
        const copy = confirmCopy(confirmAction)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-800">{copy.title}</h2>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="إغلاق"
                  disabled={actionPending}
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{copy.body}</p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
                  disabled={actionPending}
                  onClick={() => setConfirmAction(null)}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className={`flex-1 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 ${copy.confirmClass}`}
                  disabled={actionPending}
                  onClick={handleConfirm}
                >
                  {actionPending ? 'جارٍ الحفظ...' : copy.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
