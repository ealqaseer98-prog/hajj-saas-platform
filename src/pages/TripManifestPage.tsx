// src/pages/TripManifestPage.tsx
// Generates a printable/PDF-ready trip manifest for authorities
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Printer, Download, Users, Plane, Filter } from 'lucide-react'
import type { Trip } from '../types'

export default function TripManifestPage() {
  const [selectedTrip, setSelectedTrip] = useState<string>('')
  const [showPrint, setShowPrint]        = useState(false)

  const { data: trips = [] } = useQuery({
    queryKey: ['trips-list'],
    queryFn: async () => {
      const { data } = await supabase.from('trips').select('*').order('departure_date', { ascending: false })
      return (data ?? []) as Trip[]
    },
  })

  const { data: manifest, isLoading } = useQuery({
    queryKey: ['trip-manifest', selectedTrip],
    queryFn: async () => {
      if (!selectedTrip) return null
      const [{ data: tripData }, { data: legs }, { data: enrolled }, { data: hotels }] = await Promise.all([
        supabase.from('trips').select('*').eq('id', selectedTrip).single(),
        supabase.from('trip_legs').select('*').eq('trip_id', selectedTrip).order('leg_order'),
        supabase.from('traveller_trips')
          .select('*, traveller:travellers(*)')
          .eq('trip_id', selectedTrip)
          .eq('status', 'confirmed')
          .order('traveller(full_name_ar)'),
        supabase.from('hotels')
          .select('*, rooms:rooms(*, assignments:room_assignments(*, traveller:travellers(id)))')
          .eq('trip_id', selectedTrip),
      ])
      return { trip: tripData, legs: legs ?? [], enrolled: enrolled ?? [], hotels: hotels ?? [] }
    },
    enabled: !!selectedTrip,
  })

  const trip = manifest?.trip as Trip | undefined
  const travellers = manifest?.enrolled?.map((e: any) => e.traveller) ?? []
  const males   = travellers.filter((t: any) => t.gender === 'male').length
  const females = travellers.filter((t: any) => t.gender === 'female').length

  const printManifest = () => {
    window.print()
  }

  const TRANSPORT_AR: Record<string, string> = {
    plane: 'طائرة', bus: 'حافلة', train: 'قطار', private_car: 'سيارة'
  }

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      {/* Controls - hidden on print */}
      <div className="print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">كشف الرحلة</h1>
            <p className="text-sm text-gray-500 mt-0.5">طباعة قائمة المسافرين وتفاصيل الرحلة</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={printManifest} disabled={!manifest}
              className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 w-full md:w-auto">
              <Printer size={15} /> طباعة
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <select className="w-full md:flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={selectedTrip} onChange={e => setSelectedTrip(e.target.value)}>
            <option value="">— اختر رحلة —</option>
            {trips.map(t => <option key={t.id} value={t.id}>{t.trip_name} — {t.departure_date ?? 'بدون تاريخ'}</option>)}
          </select>
        </div>
      </div>

      {!selectedTrip && (
        <div className="print:hidden bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <Plane size={40} className="mx-auto mb-3 opacity-30" />
          اختر رحلة لعرض الكشف
        </div>
      )}

      {isLoading && <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>}

      {/* ── MANIFEST DOCUMENT ── */}
      {manifest && trip && (
        <div id="manifest-content" className="bg-white rounded-2xl border border-gray-200 shadow-sm print:shadow-none print:border-0">

          {/* Header */}
          <div className="p-8 border-b border-gray-100 print:border-b-2 print:border-black">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-3xl mb-2">🕌</div>
                <h1 className="text-2xl font-bold text-gray-900">كشف مسافري رحلة الحج</h1>
                <p className="text-gray-500 mt-1">Hajj Trip Passenger Manifest</p>
              </div>
              <div className="text-left text-sm space-y-1">
                <p className="font-bold text-gray-800">{trip.trip_name}</p>
                <p className="text-gray-500">المغادرة: {trip.departure_date ?? '—'}</p>
                <p className="text-gray-500">العودة: {trip.return_date ?? '—'}</p>
                <p className="text-gray-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-BH')}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'إجمالي المسافرين', value: travellers.length },
                { label: 'رجال',             value: males },
                { label: 'نساء',             value: females },
                { label: 'الباقة',           value: { barr: 'البر', tayaran_dammam: 'طيران - الدمام', tayaran_bahrain: 'طيران - البحرين', tasreeh_only: 'فقط تصريح' }[trip.package_type] ?? trip.package_type },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 print:bg-gray-100 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trip route */}
          {manifest.legs.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800 mb-3">مسار الرحلة</h2>
              <div className="space-y-2">
                {manifest.legs.map((leg: any, i: number) => (
                  <div key={leg.id} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-medium text-gray-700">
                      {leg.from_location} ← {leg.to_location}
                    </span>
                    <span className="text-gray-400">({TRANSPORT_AR[leg.transport_type] ?? leg.transport_type})</span>
                    {leg.flight_number && <span className="text-gray-500">رحلة: {leg.flight_number}</span>}
                    {leg.departure_dt && <span className="text-gray-400">{new Date(leg.departure_dt).toLocaleString('ar-BH')}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Travellers table */}
          <div className="p-6">
            <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Users size={16} /> قائمة المسافرين
            </h2>
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-right py-2 px-3 font-bold text-gray-700">#</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">الاسم بالعربية</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">Full Name</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">رقم البطاقة</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">جواز السفر</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">الجنس</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">التصريح</th>
                  <th className="text-right py-2 px-3 font-bold text-gray-700">الهاتف</th>
                </tr>
              </thead>
              <tbody>
                {travellers.map((t: any, i: number) => (
                  <tr key={t.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-gray-50 print:bg-gray-50' : ''}`}>
                    <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                    <td className="py-2 px-3 font-medium text-gray-800">{t.full_name_ar}</td>
                    <td className="py-2 px-3 text-gray-600" dir="ltr">{t.full_name_en}</td>
                    <td className="py-2 px-3 font-mono text-gray-600">{t.cpr_number}</td>
                    <td className="py-2 px-3 font-mono text-gray-600">{t.passport_number ?? '—'}</td>
                    <td className="py-2 px-3">
                      {t.gender === 'male' ? 'رجل' : t.gender === 'female' ? 'امرأة' : '—'}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        t.visa_status === 'approved' ? 'bg-green-100 text-green-700' :
                        t.visa_status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {t.visa_status === 'approved' ? 'موافق' : t.visa_status === 'rejected' ? 'مرفوض' : 'انتظار'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-gray-600 text-xs">{t.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Hotel room assignments */}
          {manifest.hotels.length > 0 && (
            <div className="p-6 border-t border-gray-100">
              <h2 className="text-base font-bold text-gray-800 mb-4">توزيع الغرف</h2>
              <div className="space-y-4">
                {manifest.hotels.map((hotel: any) => (
                  <div key={hotel.id}>
                    <h3 className="font-semibold text-gray-700 mb-2">{hotel.hotel_name} — {hotel.city}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {hotel.rooms?.map((room: any) => (
                        <div key={room.id} className="border border-gray-200 rounded-lg p-2">
                          <p className="text-xs font-bold text-gray-600 mb-1">غرفة {room.room_number}</p>
                          {room.assignments?.map((a: any) => (
                            <p key={a.id} className="text-xs text-gray-700">
                              {travellers.find((t: any) => t.id === a.traveller_id)?.full_name_ar ?? '—'}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature lines */}
          <div className="p-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-8 print:mt-8">
            {['توقيع المسؤول', 'ختم الوكالة', 'تاريخ التوقيع'].map(label => (
              <div key={label} className="text-center">
                <div className="border-b border-gray-400 h-12 mb-2" />
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #manifest-content, #manifest-content * { visibility: visible; }
          #manifest-content { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
