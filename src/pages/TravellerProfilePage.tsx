// src/pages/TravellerProfilePage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { ArrowRight, Phone, Mail, Plane, FileText, Receipt, History, FileStack, CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { Traveller, Invoice, TravellerTrip } from '../types'

type TabKey = 'overview' | 'financial' | 'visa' | 'documents'

export default function TravellerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('overview')

  const { data: traveller } = useQuery({
    queryKey: ['traveller', id],
    queryFn: async () => {
      const { data } = await supabase.from('travellers').select('*').eq('id', id!).single()
      return data as Traveller
    },
    enabled: !!id,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['traveller-invoices', id],
    queryFn: async () => {
      const { data } = await supabase.from('invoices')
        .select('*, trip:trips(trip_name)')
        .eq('traveller_id', id!)
        .order('issue_date', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const { data: trips = [] } = useQuery({
    queryKey: ['traveller-trips', id],
    queryFn: async () => {
      const { data } = await supabase.from('traveller_trips')
        .select('*, trip:trips(*)')
        .eq('traveller_id', id!)
      return (data ?? []) as TravellerTrip[]
    },
    enabled: !!id,
  })

  const { data: visaHistory = [] } = useQuery({
    queryKey: ['traveller-visa-history', id],
    queryFn: async () => {
      const { data } = await supabase.from('visa_history')
        .select('*').eq('traveller_id', id!)
        .order('changed_at', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id && tab === 'visa',
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['traveller-profile-docs', id],
    queryFn: async () => {
      const { data } = await supabase.from('traveller_documents')
        .select('*').eq('traveller_id', id!)
        .order('uploaded_at', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id && tab === 'documents',
  })

  const { data: rooms = [] } = useQuery({
    queryKey: ['traveller-rooms', id],
    queryFn: async () => {
      const { data } = await supabase.from('room_assignments')
        .select('*, room:rooms(room_number, room_type, hotel:hotels(hotel_name, city))')
        .eq('traveller_id', id!)
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const totalInvoiced = invoices.reduce((s: number, i: any) => s + Number(i.amount), 0)
  const totalPaid     = invoices.reduce((s: number, i: any) => s + Number(i.amount_paid), 0)
  const balance       = totalInvoiced - totalPaid

  const VISA_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    pending:  { label: 'في الانتظار', icon: <Clock size={14} />,       cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    approved: { label: 'موافق عليه',  icon: <CheckCircle2 size={14} />, cls: 'bg-green-50 text-green-700 border-green-200'  },
    rejected: { label: 'مرفوض',       icon: <XCircle size={14} />,      cls: 'bg-red-50 text-red-700 border-red-200'         },
  }

  const DOC_TYPE_AR: Record<string, string> = {
    passport: 'جواز سفر', visa: 'تصريح', id_card: 'بطاقة شخصية', other: 'أخرى'
  }

  if (!traveller) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>

  const visaCfg = VISA_CFG[traveller.visa_status] ?? VISA_CFG.pending

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto" dir="rtl">
      <button onClick={() => navigate('/travellers')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowRight size={16} /> العودة إلى الحجاج
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl">
              {traveller.gender === 'male' ? '👨' : traveller.gender === 'female' ? '🧕' : '👤'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{traveller.full_name_ar}</h1>
              <p className="text-gray-500 text-sm">{traveller.full_name_en}</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">CPR: {traveller.cpr_number}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${visaCfg.cls}`}>
              {visaCfg.icon} تصريح: {visaCfg.label}
            </span>
            <span className="text-xs text-gray-500">
              {traveller.gender === 'male' ? 'رجل' : traveller.gender === 'female' ? 'امرأة' : '—'}
              {traveller.nationality && ` · ${traveller.nationality}`}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {traveller.phone && (
            <a href={`tel:${traveller.phone}`} className="flex items-center gap-2 text-gray-600 hover:text-emerald-700">
              <Phone size={14} className="text-gray-400" /><span dir="ltr">{traveller.phone}</span>
            </a>
          )}
          {traveller.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={14} className="text-gray-400" />{traveller.email}
            </div>
          )}
          {traveller.passport_number && (
            <div className="text-gray-600">
              <span className="text-gray-400 text-xs">جواز: </span>
              <span dir="ltr">{traveller.passport_number}</span>
              {traveller.passport_expiry && <span className="text-xs text-gray-400 mr-1">({traveller.passport_expiry})</span>}
            </div>
          )}
          {traveller.date_of_birth && (
            <div className="text-gray-600">
              <span className="text-gray-400 text-xs">الميلاد: </span>{traveller.date_of_birth}
            </div>
          )}
        </div>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الفواتير',  value: totalInvoiced, color: 'text-gray-800' },
          { label: 'المدفوع',          value: totalPaid,      color: 'text-green-600' },
          { label: 'المتبقي',          value: balance,        color: balance > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{c.value.toFixed(3)} BHD</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          ['overview',   'نظرة عامة', <Plane size={13} />],
          ['financial',  'المالية',   <FileText size={13} />],
          ['visa',       'التصريح',  <History size={13} />],
          ['documents',  'المستندات', <FileStack size={13} />],
        ] as [TabKey, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <Section title="الرحلات المرتبطة" icon={<Plane size={15} />}>
            {trips.length === 0
              ? <p className="text-sm text-gray-400 py-3">لا توجد رحلات</p>
              : trips.map((tt: any) => (
                <div key={tt.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="font-medium text-gray-800 cursor-pointer hover:text-emerald-700"
                    onClick={() => navigate(`/trips/${tt.trip_id}`)}>
                    {tt.trip?.trip_name}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${tt.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {tt.status === 'confirmed' ? 'مؤكد' : tt.status === 'cancelled' ? 'ملغى' : 'انتظار'}
                  </span>
                </div>
              ))
            }
          </Section>
          <Section title="الغرف المحجوزة" icon={<Receipt size={15} />}>
            {rooms.length === 0
              ? <p className="text-sm text-gray-400 py-3">لم يتم تعيين غرفة</p>
              : rooms.map((ra: any) => (
                <div key={ra.id} className="py-2.5 border-b border-gray-50 last:border-0 text-sm">
                  <p className="font-medium text-gray-800">{ra.room?.hotel?.hotel_name} — غرفة {ra.room?.room_number}</p>
                  <p className="text-xs text-gray-400">{ra.room?.hotel?.city}</p>
                </div>
              ))
            }
          </Section>
          {traveller.notes && (
            <Section title="ملاحظات" icon={<FileText size={15} />}>
              <p className="text-sm text-gray-700 py-2">{traveller.notes}</p>
            </Section>
          )}
        </div>
      )}

      {/* ── Financial tab ── */}
      {tab === 'financial' && (
        <Section title="الفواتير والمدفوعات" icon={<FileText size={15} />}>
          {invoices.length === 0
            ? <p className="text-sm text-gray-400 py-3">لا توجد فواتير</p>
            : invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{inv.invoice_number ?? 'فاتورة'}</p>
                  <p className="text-xs text-gray-400">{inv.description ?? (inv.trip?.trip_name ?? '')} · {inv.issue_date}</p>
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-800">{Number(inv.amount).toFixed(3)} BHD</p>
                  <p className="text-xs text-green-600">مدفوع: {Number(inv.amount_paid).toFixed(3)}</p>
                </div>
              </div>
            ))
          }
        </Section>
      )}

      {/* ── Visa history tab ── */}
      {tab === 'visa' && (
        <Section title="سجل التصريح" icon={<History size={15} />}>
          {visaHistory.length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">لا يوجد سجل تغييرات</p>
            : (
              <div className="relative pt-2">
                <div className="absolute right-3 top-0 bottom-0 w-0.5 bg-gray-100" />
                <div className="space-y-4">
                  {visaHistory.map((h: any) => {
                    const cfg = VISA_CFG[h.status as string] ?? VISA_CFG.pending
                    return (
                      <div key={h.id} className="flex items-start gap-3 pr-8 relative">
                        <div className={`absolute right-0 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs shrink-0 ${
                          h.status === 'approved' ? 'bg-green-100 text-green-600' :
                          h.status === 'rejected' ? 'bg-red-100 text-red-600' :
                          'bg-amber-100 text-amber-600'}`}>
                          {cfg.icon}
                        </div>
                        <div className={`flex-1 rounded-xl border p-3 ${cfg.cls}`}>
                          <p className="text-sm font-medium">{cfg.label}</p>
                          {h.notes && <p className="text-xs mt-0.5 opacity-80">{h.notes}</p>}
                          <p className="text-xs opacity-60 mt-1">
                            {new Date(h.changed_at).toLocaleString('ar-BH')}
                            {h.changed_by && ` — ${h.changed_by}`}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
        </Section>
      )}

      {/* ── Documents tab ── */}
      {tab === 'documents' && (
        <Section title="المستندات المرفوعة" icon={<FileStack size={15} />}>
          {documents.length === 0
            ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-400 mb-2">لا توجد مستندات</p>
                <button onClick={() => navigate('/documents')}
                  className="text-xs text-emerald-600 hover:underline">
                  رفع مستندات →
                </button>
              </div>
            )
            : documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {DOC_TYPE_AR[doc.doc_type] ?? doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('ar-BH')}
                  </p>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:underline shrink-0">تنزيل</a>
              </div>
            ))
          }
        </Section>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
        {icon} {title}
      </h2>
      {children}
    </div>
  )
}
