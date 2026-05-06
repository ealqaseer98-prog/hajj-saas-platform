// src/pages/DashboardPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Users, Plane, Wallet, AlertCircle, FileWarning, Bell, CheckCircle2, Clock } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function DashboardPage() {
  const { user }  = useAuthStore()
  const navigate  = useNavigate()
  const [genderSourceFilter, setGenderSourceFilter] = useState<'all' | 'bahrain' | 'saudi'>('all')
  const [visaSourceFilter, setVisaSourceFilter] = useState<'all' | 'bahrain' | 'saudi'>('all')

  // ── Main stats ──────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [
        { data: travellerData },
        { count: upcomingTrips },
        { data: invoiceData },
        { data: accounts },
        { count: visaPending },
        { count: visaApproved },
        { count: visaRejected },
      ] = await Promise.all([
        supabase.from('travellers').select('id, gender, tasreeh_source'),
        supabase.from('trips').select('*', { count: 'exact', head: true }).eq('status', 'upcoming'),
        supabase.from('invoices').select('amount, amount_paid').neq('status', 'cancelled'),
        supabase.from('accounts').select('balance'),
        supabase.from('travellers').select('*', { count: 'exact', head: true }).eq('visa_status', 'pending'),
        supabase.from('travellers').select('*', { count: 'exact', head: true }).eq('visa_status', 'approved'),
        supabase.from('travellers').select('*', { count: 'exact', head: true }).eq('visa_status', 'rejected'),
      ])

      const total     = travellerData?.length ?? 0
      const males     = travellerData?.filter(t => t.gender === 'male').length ?? 0
      const females   = travellerData?.filter(t => t.gender === 'female').length ?? 0
      const noGender  = travellerData?.filter(t => !t.gender).length ?? 0
      const bahrainTasreeh = travellerData?.filter(t => t.tasreeh_source === 'bahrain').length ?? 0
      const saudiTasreeh   = travellerData?.filter(t => t.tasreeh_source === 'saudi').length ?? 0

      const totalInvoiced = (invoiceData ?? []).reduce((s, i) => s + Number(i.amount), 0)
      const totalPaid     = (invoiceData ?? []).reduce((s, i) => s + Number(i.amount_paid), 0)
      const totalBalance  = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0)

      return {
        travellerData: travellerData ?? [],
        total, males, females, noGender,
        bahrainTasreeh, saudiTasreeh,
        upcomingTrips: upcomingTrips ?? 0,
        totalInvoiced, totalPaid,
        outstanding: totalInvoiced - totalPaid,
        totalBalance,
        visaPending:  visaPending ?? 0,
        visaApproved: visaApproved ?? 0,
        visaRejected: visaRejected ?? 0,
      }
    },
  })

  // ── Overdue invoices ────────────────────────────────────────────────────────
  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date, amount, amount_paid, traveller:travellers(full_name_ar, phone)')
        .lt('due_date', today)
        .in('status', ['unpaid', 'partial'])
        .order('due_date')
        .limit(5)
      return (data ?? []) as any[]
    },
  })

  // ── Upcoming payment due (next 7 days) ────────────────────────────────────
  const { data: dueSoon = [] } = useQuery({
    queryKey: ['due-soon'],
    queryFn: async () => {
      const today   = new Date().toISOString().slice(0, 10)
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, due_date, amount, amount_paid, traveller:travellers(full_name_ar, phone)')
        .gte('due_date', today)
        .lte('due_date', in7days)
        .in('status', ['unpaid', 'partial'])
        .order('due_date')
        .limit(5)
      return (data ?? []) as any[]
    },
  })

  // ── Passports expiring within 6 months ────────────────────────────────────
  const { data: expiringPassports = [] } = useQuery({
    queryKey: ['expiring-passports'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const in6mo = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('travellers')
        .select('id, full_name_ar, passport_number, passport_expiry')
        .gte('passport_expiry', today)
        .lte('passport_expiry', in6mo)
        .order('passport_expiry')
        .limit(5)
      return (data ?? []) as any[]
    },
  })

  // ── Recent travellers ───────────────────────────────────────────────────────
  const { data: recentTravellers = [] } = useQuery({
    queryKey: ['recent-travellers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('travellers')
        .select('id, full_name_ar, gender, visa_status, created_at')
        .order('created_at', { ascending: false })
        .limit(6)
      return (data ?? []) as any[]
    },
  })

  // ── Upcoming trips ─────────────────────────────────────────────────────────
  const { data: upcomingTrips = [] } = useQuery({
    queryKey: ['upcoming-trips-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('trips')
        .select('id, trip_name, departure_date, max_travellers')
        .eq('status', 'upcoming')
        .order('departure_date')
        .limit(5)
      return (data ?? []) as any[]
    },
  })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  const alertCount = (stats?.visaPending ?? 0) + overdueInvoices.length + expiringPassports.length

  const genderFilteredTravellers = (stats?.travellerData ?? []).filter((t: any) =>
    genderSourceFilter === 'all' ? true : t.tasreeh_source === genderSourceFilter
  )
  const genderTotal = genderFilteredTravellers.length
  const genderMales = genderFilteredTravellers.filter((t: any) => t.gender === 'male').length
  const genderFemales = genderFilteredTravellers.filter((t: any) => t.gender === 'female').length
  const genderNoGender = genderFilteredTravellers.filter((t: any) => !t.gender).length
  const malePercent = genderTotal ? Math.round((genderMales / genderTotal) * 100) : 0
  const femalePercent = genderTotal ? Math.round((genderFemales / genderTotal) * 100) : 0
  const visaFilteredTravellers = (stats?.travellerData ?? []).filter((t: any) =>
    visaSourceFilter === 'all' ? true : t.tasreeh_source === visaSourceFilter
  )
  const visaFilteredTotal = visaFilteredTravellers.length

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{greeting()}، {user?.full_name ?? user?.username} 👋</h1>
          <p className="text-gray-500 text-sm mt-0.5">ملخص حملة العمار للحج والعمرة</p>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <Bell size={15} className="text-red-500" />
            <span className="text-sm font-medium text-red-700">{alertCount} تنبيه</span>
          </div>
        )}
      </div>

      {/* ── Alert banners ── */}
      <div className="space-y-2">
        {(stats?.visaPending ?? 0) > 0 && (
          <AlertBanner color="amber" icon={<Clock size={16} />}
            message={`${stats?.visaPending} مسافر بتصريح في الانتظار`}
            action="عرض المسافرين" onAction={() => navigate('/travellers')} />
        )}
        {(stats?.visaRejected ?? 0) > 0 && (
          <AlertBanner color="red" icon={<AlertCircle size={16} />}
            message={`${stats?.visaRejected} مسافر رُفض تصريحه`}
            action="عرض" onAction={() => navigate('/travellers')} />
        )}
        {overdueInvoices.length > 0 && (
          <AlertBanner color="red" icon={<FileWarning size={16} />}
            message={`${overdueInvoices.length} فاتورة متأخرة عن موعد السداد`}
            action="عرض المحاسبة" onAction={() => navigate('/accounting')} />
        )}
        {expiringPassports.length > 0 && (
          <AlertBanner color="amber" icon={<AlertCircle size={16} />}
            message={`${expiringPassports.length} جواز سفر ينتهي خلال 6 أشهر`}
            action="عرض" onAction={() => navigate('/travellers')} />
        )}
        {dueSoon.length > 0 && (
          <AlertBanner color="blue" icon={<Bell size={16} />}
            message={`${dueSoon.length} فاتورة تستحق خلال 7 أيام`}
            action="عرض" onAction={() => navigate('/accounting')} />
        )}
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'إجمالي المسافرين', value: stats?.total ?? 0,         icon: Users,        color: 'text-teal-600',    bg: 'bg-teal-50',    link: '/travellers' },
          { label: 'تصاريح البحرين',   value: stats?.bahrainTasreeh ?? 0, icon: CheckCircle2, color: 'text-blue-600',    bg: 'bg-blue-50',    link: '/travellers' },
          { label: 'تصاريح السعودية',  value: stats?.saudiTasreeh ?? 0,   icon: CheckCircle2, color: 'text-green-600',   bg: 'bg-green-50',   link: '/travellers' },
          { label: 'رحلات قادمة',       value: stats?.upcomingTrips ?? 0, icon: Plane,         color: 'text-blue-600',    bg: 'bg-blue-50',    link: '/trips' },
          { label: 'رصيد الحسابات',    value: `${(stats?.totalBalance ?? 0).toFixed(3)} BHD`, icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/accounts' },
          { label: 'المبالغ المستحقة', value: `${(stats?.outstanding ?? 0).toFixed(3)} BHD`,  icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', link: '/accounting' },
        ].map(card => (
          <button key={card.label} onClick={() => navigate(card.link)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-right hover:shadow-md transition-shadow">
            <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-2`}>
              <card.icon size={17} className={card.color} />
            </div>
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${card.color}`}>{card.value}</p>
          </button>
        ))}
      </div>

      {/* ── Gender + Visa breakdown row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Gender breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-semibold text-gray-700">توزيع المسافرين حسب الجنس</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {([
                ['all', 'الكل'],
                ['bahrain', 'تصاريح البحرين'],
                ['saudi', 'تصاريح السعودية'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setGenderSourceFilter(value)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    genderSourceFilter === value ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {/* Male bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="flex items-center gap-1.5 text-blue-700 font-medium">
                  <span className="text-base">👨</span> ذكور
                </span>
                <span className="font-bold text-blue-700">{genderMales}
                  <span className="text-xs font-normal text-gray-400 mr-1">({malePercent}%)</span>
                </span>
              </div>
              <div className="h-3 bg-blue-50 rounded-full overflow-hidden">
                <div className="h-3 bg-blue-400 rounded-full transition-all duration-500"
                  style={{ width: `${malePercent}%` }} />
              </div>
            </div>
            {/* Female bar */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="flex items-center gap-1.5 text-pink-700 font-medium">
                  <span className="text-base">👩</span> إناث
                </span>
                <span className="font-bold text-pink-700">{genderFemales}
                  <span className="text-xs font-normal text-gray-400 mr-1">({femalePercent}%)</span>
                </span>
              </div>
              <div className="h-3 bg-pink-50 rounded-full overflow-hidden">
                <div className="h-3 bg-pink-400 rounded-full transition-all duration-500"
                  style={{ width: `${femalePercent}%` }} />
              </div>
            </div>
            {genderNoGender > 0 && (
              <p className="text-xs text-gray-400">{genderNoGender} مسافر بدون تحديد جنس</p>
            )}
            {/* Stacked visual */}
            {genderTotal > 0 && (
              <div className="mt-2 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-4 bg-blue-400 transition-all duration-500" style={{ width: `${malePercent}%` }} />
                <div className="h-4 bg-pink-400 transition-all duration-500" style={{ width: `${femalePercent}%` }} />
                <div className="h-4 bg-gray-200 flex-1" />
              </div>
            )}
          </div>
        </div>

        {/* Visa status breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-semibold text-gray-700">حالة التصاريح</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {([
                ['all', 'الكل'],
                ['bahrain', 'تصاريح البحرين'],
                ['saudi', 'تصاريح السعودية'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setVisaSourceFilter(value)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    visaSourceFilter === value ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'موافق عليه',  count: visaFilteredTravellers.filter((t: any) => t.visa_status === 'approved').length, color: 'bg-green-400', textColor: 'text-green-700', bg: 'bg-green-50', icon: <CheckCircle2 size={14} /> },
              { label: 'في الانتظار', count: visaFilteredTravellers.filter((t: any) => t.visa_status === 'pending').length,  color: 'bg-amber-400', textColor: 'text-amber-700',  bg: 'bg-amber-50', icon: <Clock size={14} /> },
              { label: 'مرفوض',       count: visaFilteredTravellers.filter((t: any) => t.visa_status === 'rejected').length, color: 'bg-red-400',   textColor: 'text-red-700',   bg: 'bg-red-50',   icon: <AlertCircle size={14} /> },
            ].map(row => {
              const pct = visaFilteredTotal ? Math.round((row.count / visaFilteredTotal) * 100) : 0
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className={`flex items-center gap-1.5 font-medium ${row.textColor}`}>
                      {row.icon} {row.label}
                    </span>
                    <span className={`font-bold ${row.textColor}`}>{row.count}
                      <span className="text-xs font-normal text-gray-400 mr-1">({pct}%)</span>
                    </span>
                  </div>
                  <div className={`h-3 ${row.bg} rounded-full overflow-hidden`}>
                    <div className={`h-3 ${row.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Financial summary ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">الملخص المالي</h2>
        <div className="space-y-3">
          {[
            { label: 'إجمالي الفواتير',  value: stats?.totalInvoiced ?? 0, color: 'bg-gray-300' },
            { label: 'المبالغ المحصّلة', value: stats?.totalPaid ?? 0,     color: 'bg-emerald-400' },
            { label: 'المستحق',           value: stats?.outstanding ?? 0,   color: 'bg-red-400' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-28 text-xs text-gray-500 shrink-0">{row.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className={`h-2 rounded-full ${row.color} transition-all`}
                  style={{ width: `${stats?.totalInvoiced ? Math.min(100, (row.value / stats.totalInvoiced) * 100) : 0}%` }} />
              </div>
              <div className="text-sm font-medium text-gray-700 w-36 text-left shrink-0">
                {row.value.toFixed(3)} BHD
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom 3-col grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Recent travellers */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">آخر المسافرين</h2>
            <button onClick={() => navigate('/travellers')} className="text-xs text-emerald-600 hover:underline">الكل</button>
          </div>
          <div className="space-y-1.5">
            {recentTravellers.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
                <span className="text-gray-700 flex items-center gap-1">
                  {t.gender === 'male' ? '👨' : t.gender === 'female' ? '👩' : '👤'}
                  {t.full_name_ar}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  t.visa_status === 'approved' ? 'bg-green-100 text-green-700'
                  : t.visa_status === 'rejected' ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'}`}>
                  {t.visa_status === 'approved' ? '✓' : t.visa_status === 'rejected' ? '✗' : '⏳'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming trips */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">الرحلات القادمة</h2>
            <button onClick={() => navigate('/trips')} className="text-xs text-emerald-600 hover:underline">الكل</button>
          </div>
          <div className="space-y-1.5">
            {upcomingTrips.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 text-sm border-b border-gray-50 last:border-0 cursor-pointer hover:text-emerald-700"
                onClick={() => navigate(`/trips/${t.id}`)}>
                <span className="text-gray-700">{t.trip_name}</span>
                <span className="text-gray-400 text-xs">{t.departure_date ?? '—'}</span>
              </div>
            ))}
            {upcomingTrips.length === 0 && <p className="text-sm text-gray-400">لا توجد رحلات قادمة</p>}
          </div>
        </div>

        {/* Due soon invoices */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">فواتير تستحق قريبًا</h2>
            <button onClick={() => navigate('/accounting')} className="text-xs text-emerald-600 hover:underline">الكل</button>
          </div>
          <div className="space-y-1.5">
            {dueSoon.length === 0 && overdueInvoices.length === 0 && (
              <p className="text-sm text-gray-400">لا توجد فواتير متأخرة</p>
            )}
            {overdueInvoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-1.5 text-xs border-b border-gray-50 last:border-0">
                <span className="text-red-600 font-medium">{inv.traveller?.full_name_ar ?? '—'}</span>
                <span className="text-red-500">{(Number(inv.amount) - Number(inv.amount_paid)).toFixed(3)} BHD</span>
              </div>
            ))}
            {dueSoon.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-1.5 text-xs border-b border-gray-50 last:border-0">
                <span className="text-amber-700">{inv.traveller?.full_name_ar ?? '—'}</span>
                <span className="text-amber-600 flex items-center gap-1">
                  <Clock size={10} /> {inv.due_date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Alert Banner component ────────────────────────────────────────────────────
function AlertBanner({ color, icon, message, action, onAction }: {
  color: 'amber' | 'red' | 'blue'
  icon: React.ReactNode
  message: string
  action: string
  onAction: () => void
}) {
  const styles = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red:   'bg-red-50 border-red-200 text-red-800',
    blue:  'bg-blue-50 border-blue-200 text-blue-800',
  }
  const iconStyles = {
    amber: 'text-amber-500',
    red:   'text-red-500',
    blue:  'text-blue-500',
  }
  return (
    <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${styles[color]}`}>
      <span className={iconStyles[color]}>{icon}</span>
      <p className="text-sm flex-1">{message}</p>
      <button onClick={onAction} className="text-xs font-medium hover:underline shrink-0">{action} →</button>
    </div>
  )
}
