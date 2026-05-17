// src/pages/CarUsagePage.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { Car, LogIn, LogOut, Camera, FileText, Plus, Printer, Search, Edit2, Trash2 } from 'lucide-react'

const LOGO_URL = 'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'
const BUCKET   = 'car-photos'

type Tab = 'active' | 'history' | 'cars'

export default function CarUsagePage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('active')

  // ── Fetch cars ────────────────────────────────────────────────────────────
  const { data: cars = [] } = useQuery({
    queryKey: ['cars'],
    queryFn: async () => {
      const { data } = await supabase.from('cars').select('*').eq('is_active', true).order('name')
      return (data ?? []) as any[]
    },
  })

  // ── Fetch active usages (cars currently out) ──────────────────────────────
  const { data: activeUsages = [] } = useQuery({
    queryKey: ['car-usage-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('car_usage')
        .select('*, car:cars(*), photos:car_photos(*)')
        .eq('status', 'out')
        .order('checkout_time', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  // ── Fetch history ─────────────────────────────────────────────────────────
  const [historySearch, setHistorySearch] = useState('')
  const { data: history = [] } = useQuery({
    queryKey: ['car-usage-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('car_usage')
        .select('*, car:cars(*), photos:car_photos(*)')
        .eq('status', 'returned')
        .order('checkout_time', { ascending: false })
        .limit(100)
      return (data ?? []) as any[]
    },
  })

  const filteredHistory = history.filter((u: any) =>
    !historySearch || u.driver_name?.includes(historySearch) ||
    u.car?.name?.includes(historySearch)
  )

  // Available cars (not currently out)
  const busyCars = activeUsages.map((u: any) => u.car_id)
  const availableCars = cars.filter((c: any) => !busyCars.includes(c.id))

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">إدارة السيارات</h1>
          <p className="text-sm text-gray-500 mt-0.5">تسجيل استخدام السيارات</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${availableCars.length > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {availableCars.length} متاحة
          </span>
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {activeUsages.length} في الخارج
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          ['active',  'السيارات الخارجة', <Car size={14} />],
          ['history', 'السجل',            <FileText size={14} />],
          ['cars',    'السيارات',          <Plus size={14} />],
        ] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'active'  && <ActiveTab cars={cars} availableCars={availableCars} activeUsages={activeUsages} qc={qc} />}
      {tab === 'history' && <HistoryTab history={filteredHistory} search={historySearch} setSearch={setHistorySearch} qc={qc} />}
      {tab === 'cars'    && <CarsTab cars={cars} qc={qc} />}
    </div>
  )
}

// ── ACTIVE TAB ────────────────────────────────────────────────────────────────
function ActiveTab({ cars, availableCars, activeUsages, qc }: any) {
  const fullName = useAuthStore(s => s.user?.full_name ?? '')
  const [checkoutModal, setCheckoutModal] = useState(false)
  const [checkinModal,  setCheckinModal]  = useState<any>(null)
  const [form, setForm] = useState({ car_id: '', driver_name: '', notes: '' })
  const [checkinForm, setCheckinForm]     = useState({ notes: '' })
  const checkoutPhotoRef = useRef<HTMLInputElement>(null)
  const checkinPhotoRef  = useRef<HTMLInputElement>(null)
  const [checkoutPhotos, setCheckoutPhotos] = useState<File[]>([])
  const [checkinPhotos,  setCheckinPhotos]  = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const uploadPhotos = async (files: File[], usageId: string, type: 'checkout' | 'checkin') => {
    for (const file of files) {
      const path = `${usageId}/${type}_${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('car-photos').upload(path, file)
      if (!error) {
        const { data: url } = supabase.storage.from('car-photos').getPublicUrl(path)
        await supabase.from('car_photos').insert({
          usage_id: usageId, photo_type: type,
          file_url: url.publicUrl, storage_path: path,
        })
      }
    }
  }

  const checkout = useMutation({
    mutationFn: async () => {
      setUploading(true)
      const { data, error } = await supabase.from('car_usage').insert({
        car_id:       form.car_id,
        driver_name:  form.driver_name,
        notes:        form.notes || null,
        checkout_time: new Date().toISOString(),
        status:       'out',
      }).select().single()
      if (error) throw error
      if (checkoutPhotos.length > 0) await uploadPhotos(checkoutPhotos, data.id, 'checkout')
      setUploading(false)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['car-usage-active'] })
      setCheckoutModal(false)
      setForm({ car_id: '', driver_name: '', notes: '' })
      setCheckoutPhotos([])
    },
    onError: () => setUploading(false),
  })

  const checkin = useMutation({
    mutationFn: async () => {
      setUploading(true)
      await supabase.from('car_usage').update({
        checkin_time: new Date().toISOString(),
        notes:        checkinForm.notes || null,
        status:       'returned',
      }).eq('id', checkinModal.id).throwOnError()
      if (checkinPhotos.length > 0) await uploadPhotos(checkinPhotos, checkinModal.id, 'checkin')
      setUploading(false)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['car-usage-active'] })
      qc.invalidateQueries({ queryKey: ['car-usage-history'] })
      setCheckinModal(null)
      setCheckinForm({ notes: '' })
      setCheckinPhotos([])
    },
    onError: () => setUploading(false),
  })

  return (
    <>
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700">السيارات المتاحة: {availableCars.length}</h2>
        <button onClick={() => { setForm({ car_id: '', driver_name: fullName, notes: '' }); setCheckoutModal(true) }} disabled={availableCars.length === 0}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
          <LogOut size={15} /> تسجيل خروج سيارة
        </button>
      </div>

      {/* Active usages */}
      {activeUsages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          <Car size={36} className="mx-auto mb-3 opacity-30" />
          لا توجد سيارات في الخارج حالياً
        </div>
      ) : (
        <div className="grid gap-4">
          {activeUsages.map((u: any) => (
            <div key={u.id} className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚗</span>
                    <span className="font-bold text-gray-800">{u.car?.name}</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">في الخارج</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">السائق: <strong>{u.driver_name}</strong></p>
                  {u.destination && <p className="text-sm text-gray-500">الوجهة: {u.destination}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    وقت الخروج: {new Date(u.checkout_time).toLocaleString('ar-BH')}
                  </p>
                  {u.checkout_km && <p className="text-xs text-gray-400">عداد الخروج: {u.checkout_km} كم</p>}
                </div>
                <button onClick={() => setCheckinModal(u)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  <LogIn size={15} /> تسجيل عودة
                </button>
              </div>
              {/* Checkout photos */}
              {u.photos?.filter((p: any) => p.photo_type === 'checkout').length > 0 && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {u.photos.filter((p: any) => p.photo_type === 'checkout').map((p: any) => (
                    <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer">
                      <img src={p.file_url} alt="صورة" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutModal && (
        <Modal title="تسجيل خروج سيارة" onClose={() => setCheckoutModal(false)}
          onSave={() => checkout.mutate()} saving={uploading || checkout.isPending}
          disabled={!form.car_id || !form.driver_name}>
          <div>
            <label className={lbl}>السيارة *</label>
            <select className={ic} value={form.car_id} onChange={e => setForm(f => ({ ...f, car_id: e.target.value }))}>
              <option value="">— اختر سيارة —</option>
              {availableCars.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} — {c.plate}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>اسم السائق *</label>
            <input className={ic} value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>ملاحظات</label>
            <textarea className={ic + ' resize-none'} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>صور السيارة عند الخروج</label>
            <input ref={checkoutPhotoRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => setCheckoutPhotos(Array.from(e.target.files ?? []))} />
            <button onClick={() => checkoutPhotoRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
              <Camera size={20} className="mx-auto mb-1 text-gray-400" />
              <p className="text-sm text-gray-500">
                {checkoutPhotos.length > 0 ? `${checkoutPhotos.length} صورة محددة` : 'اضغط لإضافة صور'}
              </p>
            </button>
          </div>
        </Modal>
      )}

      {/* Checkin Modal */}
      {checkinModal && (
        <Modal title={`تسجيل عودة — ${checkinModal.car?.name}`} onClose={() => setCheckinModal(null)}
          onSave={() => checkin.mutate()} saving={uploading || checkin.isPending}>
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <p>السائق: <strong>{checkinModal.driver_name}</strong></p>
            {checkinModal.destination && <p>الوجهة: {checkinModal.destination}</p>}
            <p className="text-xs text-gray-400">خرج: {new Date(checkinModal.checkout_time).toLocaleString('ar-BH')}</p>
          </div>
          <div>
            <label className={lbl}>ملاحظات</label>
            <textarea className={ic + ' resize-none'} rows={2} value={checkinForm.notes}
              onChange={e => setCheckinForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>صور السيارة عند العودة</label>
            <input ref={checkinPhotoRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => setCheckinPhotos(Array.from(e.target.files ?? []))} />
            <button onClick={() => checkinPhotoRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <Camera size={20} className="mx-auto mb-1 text-gray-400" />
              <p className="text-sm text-gray-500">
                {checkinPhotos.length > 0 ? `${checkinPhotos.length} صورة محددة` : 'اضغط لإضافة صور العودة'}
              </p>
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
function HistoryTab({ history, search, setSearch, qc }: any) {
  const [editRecord, setEditRecord] = useState<any>(null)
  const [editForm, setEditForm]     = useState({
    driver_name: '', notes: '', checkout_time: '', checkin_time: '', status: 'returned' as 'out' | 'returned',
  })

  const openEdit = (u: any) => {
    setEditForm({
      driver_name:   u.driver_name ?? '',
      notes:         u.notes ?? '',
      checkout_time: toDatetimeLocal(u.checkout_time),
      checkin_time:  toDatetimeLocal(u.checkin_time),
      status:        u.status === 'out' ? 'out' : 'returned',
    })
    setEditRecord(u)
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      await supabase.from('car_usage').update({
        driver_name:   editForm.driver_name,
        notes:         editForm.notes || null,
        checkout_time: fromDatetimeLocal(editForm.checkout_time),
        checkin_time:  editForm.checkin_time ? fromDatetimeLocal(editForm.checkin_time) : null,
        status:        editForm.status,
      }).eq('id', editRecord.id).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['car-usage-history'] })
      qc.invalidateQueries({ queryKey: ['car-usage-active'] })
      setEditRecord(null)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('car_usage').delete().eq('id', id).throwOnError(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['car-usage-history'] })
      qc.invalidateQueries({ queryKey: ['car-usage-active'] })
    },
  })
  const printReport = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html dir="rtl" lang="ar">
      <head><meta charset="UTF-8"><title>تقرير استخدام السيارات</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
      <style>
        * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
        body { margin: 15px; direction: rtl; font-size: 12px; }
        .header { text-align: center; margin-bottom: 15px; }
        img { height: 60px; display: block; margin: 0 auto 8px; }
        h1 { font-size: 16px; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: right; }
        th { background: #f0f0f0; font-weight: bold; }
        tr:nth-child(even) { background: #f9f9f9; }
        @media print { body { margin: 5mm; } }
      </style></head>
      <body>
        <div class="header">
          <img src="${LOGO_URL}" crossorigin="anonymous" />
          <h1>تقرير استخدام السيارات</h1>
          <p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-BH')}</p>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>السيارة</th><th>السائق</th>
            <th>وقت الخروج</th><th>وقت العودة</th>
          </tr></thead>
          <tbody>
            ${history.map((u: any, i: number) => `<tr>
                <td>${i+1}</td>
                <td>${u.car?.name ?? '—'}</td>
                <td>${u.driver_name}</td>
                <td>${new Date(u.checkout_time).toLocaleString('ar-BH')}</td>
                <td>${u.checkin_time ? new Date(u.checkin_time).toLocaleString('ar-BH') : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:10px">إجمالي الرحلات: <strong>${history.length}</strong></p>
        <script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),2000)},1500)}</script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ابحث بالسائق أو السيارة..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={printReport}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium">
          <Printer size={15} /> تقرير PDF
        </button>
      </div>

      <div className="space-y-3">
        {history.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">لا يوجد سجل</div>
        ) : history.map((u: any) => {
          const km = u.checkin_km && u.checkout_km ? (u.checkin_km - u.checkout_km).toFixed(1) : null
          const duration = u.checkin_time
            ? Math.round((new Date(u.checkin_time).getTime() - new Date(u.checkout_time).getTime()) / 60000)
            : null
          return (
            <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{u.car?.name}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">عادت</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">السائق: <strong>{u.driver_name}</strong></p>
                  {u.destination && <p className="text-sm text-gray-500">الوجهة: {u.destination}</p>}
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-left text-xs text-gray-400 space-y-0.5">
                    {km && <p>المسافة: <strong className="text-gray-700">{km} كم</strong></p>}
                    {duration && <p>المدة: <strong className="text-gray-700">{duration} دقيقة</strong></p>}
                  </div>
                  <button onClick={() => openEdit(u)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => window.confirm('حذف هذا السجل؟') && del.mutate(u.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-gray-400">
                <span>خروج: {new Date(u.checkout_time).toLocaleString('ar-BH')}</span>
                {u.checkin_time && <span>عودة: {new Date(u.checkin_time).toLocaleString('ar-BH')}</span>}
              </div>
              {/* Photos */}
              {u.photos?.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {u.photos.map((p: any) => (
                    <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer">
                      <img src={p.file_url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editRecord && (
        <Modal title={`تعديل السجل — ${editRecord.car?.name}`} onClose={() => setEditRecord(null)}
          onSave={() => saveEdit.mutate()} saving={saveEdit.isPending}
          disabled={!editForm.driver_name || !editForm.checkout_time}>
          <div>
            <label className={lbl}>اسم السائق *</label>
            <input className={ic} value={editForm.driver_name}
              onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>وقت الخروج *</label>
            <input className={ic} type="datetime-local" value={editForm.checkout_time}
              onChange={e => setEditForm(f => ({ ...f, checkout_time: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>وقت العودة</label>
            <input className={ic} type="datetime-local" value={editForm.checkin_time}
              onChange={e => setEditForm(f => ({ ...f, checkin_time: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>الحالة</label>
            <select className={ic} value={editForm.status}
              onChange={e => setEditForm(f => ({ ...f, status: e.target.value as 'out' | 'returned' }))}>
              <option value="returned">عادت</option>
              <option value="out">في الخارج</option>
            </select>
          </div>
          <div>
            <label className={lbl}>ملاحظات</label>
            <textarea className={ic + ' resize-none'} rows={2} value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </Modal>
      )}
    </>
  )
}

// ── CARS MANAGEMENT TAB ───────────────────────────────────────────────────────
function CarsTab({ cars, qc }: any) {
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState({ name: '', plate: '', model: '', color: '' })

  const addCar = useMutation({
    mutationFn: () => supabase.from('cars').insert(form).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cars'] }); setModal(false); setForm({ name: '', plate: '', model: '', color: '' }) },
  })

  const toggleCar = useMutation({
    mutationFn: ({ id, is_active }: any) => supabase.from('cars').update({ is_active: !is_active }).eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cars'] }),
  })

  return (
    <>
      <div className="flex justify-end">
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> إضافة سيارة
        </button>
      </div>

      <div className="grid gap-3">
        {cars.map((car: any) => (
          <div key={car.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-800">{car.name}</p>
              <p className="text-sm text-gray-500">{car.plate} {car.model && `· ${car.model}`} {car.color && `· ${car.color}`}</p>
            </div>
            <button onClick={() => toggleCar.mutate(car)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${car.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
              {car.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="إضافة سيارة جديدة" onClose={() => setModal(false)}
          onSave={() => addCar.mutate()} saving={addCar.isPending}
          disabled={!form.name || !form.plate}>
          {[['اسم السيارة *','name'],['رقم اللوحة *','plate'],['الموديل','model'],['اللون','color']].map(([label, key]) => (
            <div key={key}>
              <label className={lbl}>{label}</label>
              <input className={ic} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
        </Modal>
      )}
    </>
  )
}


function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, onSave, saving, disabled }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto" dir="rtl">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {children}
        <div className="flex gap-3 pt-2">
          <button onClick={onSave} disabled={saving || disabled}
            className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

const ic  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'
