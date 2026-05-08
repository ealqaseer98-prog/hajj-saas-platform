// src/pages/AdahiPage.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Search, FileText, Printer, Filter } from 'lucide-react'

const SAR_CASH_ACCOUNT_ID = '18acae25-9a14-40ee-acd1-9f40f87cc142'
const DEFAULT_AMOUNT      = 720
const DEFAULT_DESC        = 'أضحية موسم الحج 1447 هـ'

type FilterType = 'all' | 'paid' | 'unpaid'

export default function AdahiPage() {
  const qc = useQueryClient()
  const [search,       setSearch]       = useState('')
  const [listFilter,   setListFilter]   = useState<FilterType>('all')
  const [processing,   setProcessing]   = useState<string | null>(null)  // traveller id being processed

  // ── Fetch all travellers ──────────────────────────────────────────────────
  const { data: travellers = [], isLoading } = useQuery({
    queryKey: ['adahi-travellers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('travellers')
        .select('id, full_name_ar, cpr_number, phone, gender')
        .order('full_name_ar')
      return (data ?? []) as any[]
    },
  })

  // ── Fetch existing Adahi invoices ─────────────────────────────────────────
  const { data: adahiInvoices = [] } = useQuery({
    queryKey: ['adahi-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, traveller_id, amount, amount_paid, status, invoice_number')
        .ilike('description', '%أضحية%')
      return (data ?? []) as any[]
    },
  })

  // Map traveller_id → invoice
  const invoiceMap: Record<string, any> = {}
  adahiInvoices.forEach((inv: any) => { invoiceMap[inv.traveller_id] = inv })

  // ── Create invoice + receipt together ────────────────────────────────────
  const createPayment = useMutation({
    mutationFn: async (traveller: any) => {
      setProcessing(traveller.id)

      // 1. Count existing invoices for number generation
      const { count: invCount } = await supabase
        .from('invoices').select('*', { count: 'exact', head: true })
      const invNum = `ADH-1447-${String((invCount ?? 0) + 1).padStart(3, '0')}`

      // 2. Create invoice
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invNum,
          traveller_id:   traveller.id,
          account_id:     SAR_CASH_ACCOUNT_ID,
          amount:         DEFAULT_AMOUNT,
          amount_paid:    DEFAULT_AMOUNT,
          currency:       'SAR',
          description:    DEFAULT_DESC,
          issue_date:     new Date().toISOString().slice(0, 10),
          status:         'paid',
        })
        .select()
        .single()

      if (invErr) throw invErr

      // 3. Count existing receipts for number
      const { count: rcpCount } = await supabase
        .from('receipts').select('*', { count: 'exact', head: true })
      const rcpNum = `RCP-ADH-${String((rcpCount ?? 0) + 1).padStart(3, '0')}`

      // 4. Create receipt
      const { error: rcpErr } = await supabase
        .from('receipts')
        .insert({
          receipt_number:  rcpNum,
          invoice_id:      inv.id,
          traveller_id:    traveller.id,
          account_id:      SAR_CASH_ACCOUNT_ID,
          amount:          DEFAULT_AMOUNT,
          currency:        'SAR',
          payment_method:  'cash',
          payment_date:    new Date().toISOString().slice(0, 10),
          notes:           DEFAULT_DESC,
        })

      if (rcpErr) throw rcpErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adahi-invoices'] })
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      setProcessing(null)
    },
    onError: () => setProcessing(null),
  })

  // ── Delete payment ────────────────────────────────────────────────────────
  const deletePayment = useMutation({
    mutationFn: async (travellerId: string) => {
      const inv = invoiceMap[travellerId]
      if (!inv) return
      await supabase.from('receipts').delete().eq('invoice_id', inv.id)
      await supabase.from('invoices').delete().eq('id', inv.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adahi-invoices'] }),
  })

  // ── Filter + search ───────────────────────────────────────────────────────
  const filtered = travellers.filter((t: any) => {
    const matchSearch = !search.trim() ||
      t.full_name_ar?.includes(search) || t.cpr_number?.includes(search)
    const hasPaid  = !!invoiceMap[t.id]
    const matchFilter =
      listFilter === 'all'    ? true :
      listFilter === 'paid'   ? hasPaid :
      listFilter === 'unpaid' ? !hasPaid : true
    return matchSearch && matchFilter
  })

  const paidCount   = travellers.filter((t: any) => !!invoiceMap[t.id]).length
  const unpaidCount = travellers.length - paidCount
  const totalSAR    = paidCount * DEFAULT_AMOUNT

  // ── Print receipt for one traveller ──────────────────────────────────────
  const printReceipt = (traveller: any) => {
    const inv  = invoiceMap[traveller.id]
    if (!inv) return
    const date = new Date().toLocaleDateString('ar-BH')
    const win  = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إيصال أضحية</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
          body { margin: 20px; direction: rtl; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .header h1 { font-size: 20px; margin: 0; }
          .header h2 { font-size: 16px; margin: 5px 0; color: #555; }
          .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
          .label { color: #666; }
          .value { font-weight: bold; }
          .amount { font-size: 20px; font-weight: bold; text-align: center; border: 2px solid #000; padding: 10px; margin: 15px 0; border-radius: 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #888; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print { body { margin: 5mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🕌 حملة العمار للحج والعمرة</h1>
          <h2>إيصال استلام أضحية</h2>
        </div>
        <div class="row"><span class="label">رقم الإيصال:</span><span class="value">${inv.invoice_number}</span></div>
        <div class="row"><span class="label">التاريخ:</span><span class="value">${date}</span></div>
        <div class="row"><span class="label">اسم الحاج:</span><span class="value">${traveller.full_name_ar}</span></div>
        <div class="row"><span class="label">رقم البطاقة:</span><span class="value">${traveller.cpr_number}</span></div>
        <div class="row"><span class="label">الوصف:</span><span class="value">${DEFAULT_DESC}</span></div>
        <div class="row"><span class="label">طريقة الدفع:</span><span class="value">نقدي</span></div>
        <div class="amount">المبلغ المستلم: ${DEFAULT_AMOUNT.toLocaleString()} ريال سعودي</div>
        <div class="footer">
          <p>شكراً لكم — تقبل الله منكم</p>
          <p>حملة العمار للحج والعمرة</p>
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  // ── Print full list ───────────────────────────────────────────────────────
  const printList = () => {
    const date     = new Date().toLocaleDateString('ar-BH')
    const listData = filtered
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>قائمة الأضاحي</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
          body { margin: 15px; direction: rtl; font-size: 13px; }
          .header { text-align: center; margin-bottom: 15px; }
          h1 { font-size: 18px; margin: 0; }
          h3 { font-size: 13px; color: #555; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: right; }
          th { background: #f0f0f0; font-weight: bold; }
          .paid { color: green; font-weight: bold; }
          .unpaid { color: red; }
          .summary { margin-top: 15px; font-size: 13px; }
          @media print { body { margin: 5mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🕌 حملة العمار للحج والعمرة</h1>
          <h3>قائمة الأضاحي — ${DEFAULT_DESC}</h3>
          <h3>تاريخ الطباعة: ${date} | ${
            listFilter === 'paid' ? 'المدفوعون فقط' :
            listFilter === 'unpaid' ? 'غير المدفوعون فقط' : 'الكل'
          }</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الحاج</th>
              <th>رقم البطاقة</th>
              <th>رقم الهاتف</th>
              <th>المبلغ</th>
              <th>الحالة</th>
              <th>رقم الإيصال</th>
            </tr>
          </thead>
          <tbody>
            ${listData.map((t: any, i: number) => {
              const inv    = invoiceMap[t.id]
              const isPaid = !!inv
              return `<tr>
                <td>${i + 1}</td>
                <td>${t.full_name_ar}</td>
                <td>${t.cpr_number}</td>
                <td>${t.phone ?? '—'}</td>
                <td>${isPaid ? DEFAULT_AMOUNT + ' ر.س' : '—'}</td>
                <td class="${isPaid ? 'paid' : 'unpaid'}">${isPaid ? '✓ مدفوع' : '✗ لم يُدفع'}</td>
                <td>${inv?.invoice_number ?? '—'}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
        <div class="summary">
          <p>إجمالي المدفوعين: <strong>${paidCount}</strong> حاج</p>
          <p>إجمالي المبالغ المحصّلة: <strong>${totalSAR.toLocaleString()} ريال سعودي</strong></p>
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الأضاحي</h1>
          <p className="text-sm text-gray-500 mt-0.5">{DEFAULT_DESC}</p>
        </div>
        <button onClick={printList}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium">
          <Printer size={15} /> طباعة القائمة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الحجاج', value: travellers.length, color: 'text-gray-800' },
          { label: 'المدفوعون', value: paidCount, color: 'text-green-600' },
          { label: 'غير المدفوعين', value: unpaidCount, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Total collected */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-emerald-700 font-medium">إجمالي المبالغ المحصّلة</span>
        <span className="text-lg font-bold text-emerald-700">{totalSAR.toLocaleString()} ر.س</span>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ابحث بالاسم أو رقم البطاقة..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([['all','الكل'],['paid','المدفوعون'],['unpaid','غير المدفوعين']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setListFilter(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                listFilter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">لا يوجد نتائج</div>
        ) : filtered.map((t: any) => {
          const inv    = invoiceMap[t.id]
          const isPaid = !!inv

          return (
            <div key={t.id} className={`bg-white rounded-xl border shadow-sm p-4 ${isPaid ? 'border-green-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                {/* Name + info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{t.full_name_ar}</span>
                    {isPaid && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        ✓ مدفوع
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{t.cpr_number}</p>
                  {isPaid && (
                    <p className="text-xs text-gray-400 mt-0.5">رقم الإيصال: {inv.invoice_number}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!isPaid ? (
                    <button
                      onClick={() => createPayment.mutate(t)}
                      disabled={processing === t.id}
                      className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors">
                      <FileText size={13} />
                      {processing === t.id ? 'جارٍ...' : 'تسجيل الدفع'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => printReceipt(t)}
                        className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-medium transition-colors">
                        <Printer size={13} /> إيصال PDF
                      </button>
                      <button
                        onClick={() => window.confirm('حذف هذا الدفع؟') && deletePayment.mutate(t.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-2 transition-colors">
                        حذف
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Amount display */}
              {isPaid && (
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-4">
                  <span>المبلغ: <strong className="text-gray-700">{DEFAULT_AMOUNT} ر.س</strong></span>
                  <span>نقدي</span>
                  <span>{inv.invoice_number}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
