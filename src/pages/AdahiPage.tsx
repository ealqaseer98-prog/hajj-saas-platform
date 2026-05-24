// src/pages/AdahiPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Search, FileText, Printer } from 'lucide-react'

const SAR_CASH_ACCOUNT_ID = '18acae25-9a14-40ee-acd1-9f40f87cc142'
const DEFAULT_AMOUNT      = 750
const DEFAULT_DESC        = 'أضحية موسم الحج 1447 هـ'
const STAFF_EXPENSE_DESC  = 'أضحية كادر - موسم الحج 1447 هـ'

type AdahiPersonType = 'traveller' | 'staff'

type AdahiListItem = {
  type: AdahiPersonType
  id: string
  full_name_ar: string
  cpr_number: string | null
  phone: string | null
  gender: string | null
  role_title: string | null
  is_active?: boolean
}

function parseIdFromNotes(notes: string | null | undefined, prefix: 'staff_id' | 'traveller_id'): string | null {
  const match = notes?.match(new RegExp(`${prefix}:([0-9a-f-]+)`, 'i'))
  return match?.[1] ?? null
}

async function nextAdahiExpenseNumber(): Promise<string> {
  const { data } = await supabase
    .from('expenses')
    .select('expense_number')
    .ilike('expense_number', 'EXP-1447-%')
    .order('expense_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.expense_number
  const lastNum = last ? parseInt(last.split('-').pop() ?? '0', 10) : 0
  return `EXP-1447-${String(lastNum + 1).padStart(3, '0')}`
}
const LOGO_URL =
  'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'

type ListFilter = 'all' | 'paid' | 'wakala_only' | 'complete'
type AdahiPaymentMethod = 'cash' | 'bank_transfer'

function paymentMethodLabel(m: string | undefined): string {
  return m === 'bank_transfer' ? 'تحويل بنكي' : 'نقدي'
}

function formatSar(value: number) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function checkMark(ok: boolean) {
  return ok ? '✓' : '✗'
}

const fieldClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

export default function AdahiPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [paymentModal, setPaymentModal] = useState<{
    person: AdahiListItem
    amount: string
    description: string
    paymentMethod: AdahiPaymentMethod
    recordAsExpense: boolean
  } | null>(null)

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['adahi-people'],
    queryFn: async () => {
      const [{ data: travData }, { data: staffData }] = await Promise.all([
        supabase
          .from('travellers')
          .select('id, full_name_ar, cpr_number, phone, gender')
          .order('full_name_ar'),
        supabase
          .from('staff')
          .select('id, full_name_ar, role_title, phone, gender, is_active')
          .order('full_name_ar'),
      ])

      const travellers: AdahiListItem[] = (travData ?? []).map((t: any) => ({
        type: 'traveller',
        id: t.id,
        full_name_ar: t.full_name_ar,
        cpr_number: t.cpr_number ?? null,
        phone: t.phone ?? null,
        gender: t.gender ?? null,
        role_title: null,
      }))

      const staffMembers: AdahiListItem[] = (staffData ?? []).map((s: any) => ({
        type: 'staff',
        id: s.id,
        full_name_ar: s.full_name_ar,
        cpr_number: null,
        phone: s.phone ?? null,
        gender: s.gender ?? null,
        role_title: s.role_title ?? null,
        is_active: s.is_active,
      }))

      return [...travellers, ...staffMembers].sort((a, b) =>
        (a.full_name_ar ?? '').localeCompare(b.full_name_ar ?? '', 'ar')
      )
    },
  })

  const { data: adahiInvoices = [] } = useQuery({
    queryKey: ['adahi-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, traveller_id, amount, amount_paid, status, invoice_number, description, receipts(payment_method)')
        .ilike('description', '%أضحية%')
      return (data ?? []) as any[]
    },
  })

  const { data: adahiStatusRows = [] } = useQuery({
    queryKey: ['adahi-status'],
    queryFn: async () => {
      const { data } = await supabase.from('adahi_status').select('traveller_id, has_wakala')
      return (data ?? []) as { traveller_id: string; has_wakala: boolean }[]
    },
  })

  const { data: adahiExpenses = [] } = useQuery({
    queryKey: ['adahi-staff-expenses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('id, amount, expense_number, description, notes, expense_date')
        .eq('account_id', SAR_CASH_ACCOUNT_ID)
        .or(`description.ilike.%أضحية كادر%,description.ilike.%أضحية%`)
      return (data ?? []) as any[]
    },
  })

  const invoiceMap: Record<string, any> = {}
  adahiInvoices.forEach((inv: any) => {
    if (inv.traveller_id) invoiceMap[inv.traveller_id] = inv
  })

  const staffExpenseMap: Record<string, any> = {}
  const travellerExpenseMap: Record<string, any> = {}
  adahiExpenses.forEach((exp: any) => {
    const staffId = parseIdFromNotes(exp.notes, 'staff_id')
    if (staffId) staffExpenseMap[staffId] = exp
    const travellerId = parseIdFromNotes(exp.notes, 'traveller_id')
    if (travellerId) travellerExpenseMap[travellerId] = exp
  })

  const wakalaMap: Record<string, boolean> = {}
  adahiStatusRows.forEach(row => {
    wakalaMap[row.traveller_id] = row.has_wakala
  })

  const hasPaid = (person: AdahiListItem) =>
    person.type === 'traveller'
      ? !!invoiceMap[person.id] || !!travellerExpenseMap[person.id]
      : !!staffExpenseMap[person.id]

  const hasWakala = (person: AdahiListItem) =>
    person.type === 'traveller' ? !!wakalaMap[person.id] : false

  const getPaymentRecord = (person: AdahiListItem) =>
    person.type === 'traveller'
      ? invoiceMap[person.id] ?? travellerExpenseMap[person.id]
      : staffExpenseMap[person.id]

  const createPayment = useMutation({
    mutationFn: async (payload: {
      person: AdahiListItem
      amount: number
      description: string
      paymentMethod: AdahiPaymentMethod
      recordAsExpense: boolean
    }) => {
      const { person, amount, description, paymentMethod, recordAsExpense } = payload
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ غير صالح')

      if (person.type === 'staff' || recordAsExpense) {
        const expNum = await nextAdahiExpenseNumber()
        const { error } = await supabase.from('expenses').insert({
          expense_number: expNum,
          account_id: SAR_CASH_ACCOUNT_ID,
          amount,
          currency: 'SAR',
          description: person.type === 'staff' ? STAFF_EXPENSE_DESC : description,
          expense_date: new Date().toISOString().slice(0, 10),
          notes:
            person.type === 'staff'
              ? `staff_id:${person.id}`
              : `traveller_id:${person.id}`,
          category: 'other',
        })
        if (error) throw error
        return
      }

      const { data: lastInvData } = await supabase
        .from('invoices')
        .select('invoice_number')
        .ilike('invoice_number', 'ADH-1447-%')
        .order('invoice_number', { ascending: false })
        .limit(1)

      const lastNum = lastInvData?.[0]?.invoice_number
        ? parseInt(lastInvData[0].invoice_number.split('-').pop() ?? '0', 10)
        : 0
      const invNum = `ADH-1447-${String(lastNum + 1).padStart(3, '0')}`

      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invNum,
          traveller_id: person.id,
          account_id: SAR_CASH_ACCOUNT_ID,
          amount,
          currency: 'SAR',
          description,
          issue_date: new Date().toISOString().slice(0, 10),
          status: 'unpaid',
        })
        .select()
        .single()

      if (invErr) throw invErr

      const { data: rcpData } = await supabase
        .from('receipts')
        .select('receipt_number')
        .ilike('receipt_number', 'RCP-ADH-%')
        .order('receipt_number', { ascending: false })
        .limit(1)

      const lastRcpNum = rcpData?.[0]?.receipt_number
        ? parseInt(rcpData[0].receipt_number.split('-').pop() ?? '0', 10)
        : 0
      const rcpNum = `RCP-ADH-${String(lastRcpNum + 1).padStart(3, '0')}`

      const { error: rcpErr } = await supabase.from('receipts').insert({
        receipt_number: rcpNum,
        invoice_id: inv.id,
        traveller_id: person.id,
        account_id: SAR_CASH_ACCOUNT_ID,
        amount,
        currency: 'SAR',
        payment_method: paymentMethod,
        payment_date: new Date().toISOString().slice(0, 10),
        notes: description,
      })

      if (rcpErr) {
        await supabase.from('invoices').delete().eq('id', inv.id)
        throw rcpErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adahi-invoices'] })
      qc.invalidateQueries({ queryKey: ['adahi-staff-expenses'] })
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['invoices-list'] })
      setPaymentModal(null)
    },
  })

  const deletePayment = useMutation({
    mutationFn: async (person: AdahiListItem) => {
      if (person.type === 'staff') {
        const exp = staffExpenseMap[person.id]
        if (!exp) return
        await supabase.from('expenses').delete().eq('id', exp.id).throwOnError()
        return
      }
      const travExp = travellerExpenseMap[person.id]
      if (travExp) {
        await supabase.from('expenses').delete().eq('id', travExp.id).throwOnError()
        return
      }
      const inv = invoiceMap[person.id]
      if (!inv) return
      await supabase.from('receipts').delete().eq('invoice_id', inv.id)
      await supabase.from('invoices').delete().eq('id', inv.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adahi-invoices'] })
      qc.invalidateQueries({ queryKey: ['adahi-staff-expenses'] })
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['invoices-list'] })
    },
  })

  const toggleWakala = useMutation({
    mutationFn: async ({ travellerId, next }: { travellerId: string; next: boolean }) => {
      await supabase.from('adahi_status').upsert(
        {
          traveller_id: travellerId,
          has_wakala: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'traveller_id' }
      ).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adahi-status'] })
    },
  })

  const filtered = people.filter((p: AdahiListItem) => {
    const matchSearch =
      !search.trim() ||
      p.full_name_ar?.includes(search) ||
      (p.cpr_number?.includes(search) ?? false) ||
      (p.role_title?.includes(search) ?? false) ||
      p.id.includes(search)
    const paid = hasPaid(p)
    const wakala = hasWakala(p)
    const matchFilter =
      listFilter === 'all'
        ? true
        : listFilter === 'paid'
          ? paid
          : listFilter === 'wakala_only'
            ? wakala
            : listFilter === 'complete'
              ? paid && wakala
              : true
    return matchSearch && matchFilter
  })

  const paidCount = people.filter((p: AdahiListItem) => hasPaid(p)).length
  const wakalaCount = people.filter((p: AdahiListItem) => hasWakala(p)).length
  const completeCount = people.filter((p: AdahiListItem) => hasPaid(p) && hasWakala(p)).length
  const unpaidCount = people.length - paidCount
  const totalSAR =
    adahiInvoices.reduce((s: number, inv: any) => s + Number(inv.amount ?? 0), 0) +
    adahiExpenses.reduce((s: number, exp: any) => s + Number(exp.amount ?? 0), 0)

  const printReceipt = (person: AdahiListItem) => {
    const inv = person.type === 'traveller' ? invoiceMap[person.id] : null
    if (!inv) return
    const desc = (inv.description ?? DEFAULT_DESC).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const amt = Number(inv.amount ?? DEFAULT_AMOUNT)
    const pm = paymentMethodLabel(
      Array.isArray(inv.receipts) ? inv.receipts[0]?.payment_method : (inv.receipts as any)?.payment_method
    )
    const date = new Date().toLocaleDateString('ar-BH')
    const win = window.open('', '_blank')
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
          .logo-wrap { text-align: center; margin-bottom: 8px; }
          .logo { height: 80px; width: auto; object-fit: contain; }
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
        <div class="logo-wrap">
          <img class="logo" crossorigin="anonymous" src="${LOGO_URL}" alt="Alammar Logo" />
        </div>
        <div class="header">
          <h1>حملة العمار للحج والعمرة</h1>
          <h2>إيصال استلام أضحية</h2>
        </div>
        <div class="row"><span class="label">رقم الإيصال:</span><span class="value">${inv.invoice_number}</span></div>
        <div class="row"><span class="label">التاريخ:</span><span class="value">${date}</span></div>
        <div class="row"><span class="label">الاسم:</span><span class="value">${person.full_name_ar}</span></div>
        <div class="row"><span class="label">رقم البطاقة:</span><span class="value">${person.cpr_number ?? '—'}</span></div>
        <div class="row"><span class="label">الوصف:</span><span class="value">${desc}</span></div>
        <div class="row"><span class="label">طريقة الدفع:</span><span class="value">${pm}</span></div>
        <div class="amount">المبلغ المستلم: ${formatSar(amt)} ريال سعودي</div>
        <div class="footer"><p>حملة العمار للحج والعمرة</p></div>
        <script>window.onload = () => { setTimeout(() => { window.print(); setTimeout(() => window.close(), 1000); }, 2000); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  const printWakalaPdf = () => {
    const date = new Date().toLocaleDateString('ar-BH')
    const wakalaTravellers = people
      .filter((p: AdahiListItem) => p.type === 'traveller' && hasWakala(p))
      .sort((a, b) => (a.full_name_ar ?? '').localeCompare(b.full_name_ar ?? '', 'ar'))

    const males = wakalaTravellers.filter((p: AdahiListItem) => p.gender === 'male')
    const females = wakalaTravellers.filter((p: AdahiListItem) => p.gender === 'female')
    const otherGender = wakalaTravellers.filter(
      (p: AdahiListItem) => p.gender !== 'male' && p.gender !== 'female'
    )

    const totalWakala = wakalaTravellers.length
    const totalPaid = wakalaTravellers.filter((p: AdahiListItem) => hasPaid(p)).length
    const totalNotPaid = totalWakala - totalPaid

    const escapeHtml = (s: string) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const buildRows = (list: any[]) =>
      list.length === 0
        ? '<tr><td colspan="5" style="text-align:center;color:#888">لا يوجد أسماء</td></tr>'
        : list
            .map((p: AdahiListItem, i: number) => {
              const paid = hasPaid(p)
              return `<tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(p.full_name_ar)}</td>
                <td>${escapeHtml(p.cpr_number ?? '—')}</td>
                <td class="ok">${checkMark(true)}</td>
                <td class="${paid ? 'ok' : 'no'}">${checkMark(paid)}</td>
              </tr>`
            })
            .join('')

    const buildSection = (title: string, list: any[]) => `
      <section class="section">
        <h2 class="section-title">${title}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم</th>
              <th>رقم البطاقة</th>
              <th>الوكالة</th>
              <th>الدفع</th>
            </tr>
          </thead>
          <tbody>${buildRows(list)}</tbody>
        </table>
        <p class="section-count">عدد الأسماء: <strong>${list.length}</strong></p>
      </section>
    `

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>قائمة الوكالة — ${DEFAULT_DESC}</title>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
          body { margin: 15px; direction: rtl; font-size: 13px; }
          .header { text-align: center; margin-bottom: 20px; }
          h1 { font-size: 18px; margin: 0; }
          h3 { font-size: 13px; color: #555; margin: 4px 0; }
          .section { margin-bottom: 24px; }
          .section:not(:last-of-type) { page-break-after: always; }
          .section-title { font-size: 16px; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 2px solid #333; }
          .section-count { margin-top: 8px; font-size: 12px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: right; }
          th { background: #f0f0f0; font-weight: bold; }
          .ok { color: green; font-weight: bold; text-align: center; }
          .no { color: #c00; font-weight: bold; text-align: center; }
          .summary-box {
            margin-top: 24px; padding: 14px; border: 2px solid #333; border-radius: 8px;
            page-break-inside: avoid;
          }
          .summary-box p { margin: 6px 0; font-size: 14px; }
          @media print {
            body { margin: 5mm; }
            .section:not(:last-of-type) { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🕌 حملة العمار للحج والعمرة</h1>
          <h3>قائمة مستلمي الوكالة — ${DEFAULT_DESC}</h3>
          <h3>تاريخ الطباعة: ${date}</h3>
        </div>
        ${buildSection('الذكور', males)}
        ${buildSection('الإناث', females)}
        ${otherGender.length > 0 ? buildSection('غير محدد', otherGender) : ''}
        <div class="summary-box">
          <p><strong>ملخص القائمة (الوكالة فقط)</strong></p>
          <p>إجمالي من لديهم وكالة: <strong>${totalWakala}</strong></p>
          <p>المدفوعون: <strong>${totalPaid}</strong></p>
          <p>غير المدفوعين: <strong>${totalNotPaid}</strong></p>
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="p-4 md:p-6 space-y-5 pb-20 md:pb-6" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الأضاحي</h1>
          <p className="text-sm text-gray-500 mt-0.5">{DEFAULT_DESC}</p>
        </div>
        <button
          type="button"
          onClick={printWakalaPdf}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Printer size={15} /> طباعة قائمة الوكالة (PDF)
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي القائمة', value: people.length, color: 'text-gray-800' },
          { label: 'المدفوعون', value: paidCount, color: 'text-green-600' },
          { label: 'الوكالة', value: wakalaCount, color: 'text-blue-600' },
          { label: 'مكتمل', value: completeCount, color: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-emerald-700 font-medium">إجمالي المبالغ المحصّلة</span>
        <span className="text-lg font-bold text-emerald-700">{formatSar(totalSAR)} ر.س</span>
        <span className="text-xs text-emerald-600">غير المدفوعين: {unpaidCount}</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ابحث بالاسم أو البطاقة أو المسمى..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
          {(
            [
              ['all', 'الكل'],
              ['paid', 'المدفوعون'],
              ['wakala_only', 'الوكالة فقط'],
              ['complete', 'مكتمل'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setListFilter(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                listFilter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">لا يوجد نتائج</div>
        ) : (
          filtered.map((p: AdahiListItem) => {
            const record = getPaymentRecord(p)
            const isPaid = hasPaid(p)
            const isWakala = hasWakala(p)
            const isStaff = p.type === 'staff'

            return (
              <div
                key={`${p.type}-${p.id}`}
                className={`bg-white rounded-xl border shadow-sm p-4 ${
                  isPaid && isWakala
                    ? 'border-emerald-300'
                    : isPaid
                      ? 'border-green-200'
                      : isWakala
                        ? 'border-blue-200'
                        : isStaff
                          ? 'border-purple-100'
                          : 'border-gray-100'
                } ${p.is_active === false ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{p.full_name_ar}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          isStaff ? 'bg-purple-100 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isStaff ? 'كادر' : 'حاج'}
                      </span>
                      {!isStaff && (
                        <span className="text-xs text-gray-400">
                          {p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : '—'}
                        </span>
                      )}
                    </div>
                    {isStaff ? (
                      <>
                        <p className="text-xs text-purple-600 mt-0.5">{p.role_title}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
                          {p.id.slice(0, 8)}…
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{p.cpr_number}</p>
                    )}
                    {isPaid && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {record?.invoice_number
                          ? `رقم الإيصال: ${record.invoice_number}`
                          : `مصروف: ${record?.expense_number ?? '—'}`}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-default">
                        <input
                          type="checkbox"
                          checked={isPaid}
                          readOnly
                          disabled
                          className="rounded border-gray-300 text-green-600 w-4 h-4"
                        />
                        <span className={isPaid ? 'text-green-700 font-medium' : 'text-gray-500'}>دفع</span>
                      </label>
                      {!isStaff && (
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isWakala}
                            disabled={toggleWakala.isPending}
                            onChange={() =>
                              toggleWakala.mutate({ travellerId: p.id, next: !isWakala })
                            }
                            className="rounded border-gray-300 text-blue-600 w-4 h-4 cursor-pointer"
                          />
                          <span className={isWakala ? 'text-blue-700 font-medium' : 'text-gray-500'}>
                            وكالة
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {!isPaid ? (
                      <button
                        type="button"
                        onClick={() => {
                          createPayment.reset()
                          setPaymentModal({
                            person: p,
                            amount: String(DEFAULT_AMOUNT),
                            description: isStaff ? STAFF_EXPENSE_DESC : DEFAULT_DESC,
                            paymentMethod: 'cash',
                            recordAsExpense: isStaff,
                          })
                        }}
                        disabled={createPayment.isPending}
                        className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        <FileText size={13} />
                        تسجيل الدفع
                      </button>
                    ) : (
                      <>
                        {!isStaff && (
                          <button
                            type="button"
                            onClick={() => printReceipt(p)}
                            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Printer size={13} /> إيصال PDF
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            window.confirm('حذف هذا الدفع؟') && deletePayment.mutate(p)
                          }
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-2 transition-colors"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isPaid && record && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center gap-4 flex-wrap">
                    <span>
                      المبلغ:{' '}
                      <strong className="text-gray-700">{formatSar(Number(record.amount ?? 0))} ر.س</strong>
                    </span>
                    {!isStaff && (
                      <span>
                        {paymentMethodLabel(
                          Array.isArray(record.receipts)
                            ? record.receipts[0]?.payment_method
                            : (record.receipts as any)?.payment_method
                        )}
                      </span>
                    )}
                    {isStaff && <span>مصروف — الصندوق SAR</span>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {paymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adahi-payment-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h2
              id="adahi-payment-modal-title"
              className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2"
            >
              تسجيل دفع — {paymentModal.person.full_name_ar}
              <span className="block text-xs font-normal text-gray-500 mt-1">
                {paymentModal.person.type === 'staff' ? 'كادر' : 'حاج'}
              </span>
            </h2>

            {paymentModal.person.type === 'staff' ? (
              <p className="text-sm text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                سيتم تسجيل الدفع كمصروف من الصندوق SAR: {STAFF_EXPENSE_DESC}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">طريقة التسجيل</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentModal(m =>
                        m ? { ...m, recordAsExpense: false, description: DEFAULT_DESC } : m
                      )
                    }
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                      !paymentModal.recordAsExpense
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    فاتورة وإيصال
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentModal(m =>
                        m ? { ...m, recordAsExpense: true, description: DEFAULT_DESC } : m
                      )
                    }
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                      paymentModal.recordAsExpense
                        ? 'bg-purple-700 text-white border-purple-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    مصروف
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">المبلغ</label>
              <input
                type="number"
                min={0}
                step={1}
                className={fieldClass}
                value={paymentModal.amount}
                onChange={e => setPaymentModal(m => (m ? { ...m, amount: e.target.value } : m))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الوصف</label>
              <input
                type="text"
                className={fieldClass}
                value={paymentModal.description}
                disabled={
                  paymentModal.person.type === 'staff' ||
                  (paymentModal.person.type === 'traveller' && paymentModal.recordAsExpense)
                }
                onChange={e => setPaymentModal(m => (m ? { ...m, description: e.target.value } : m))}
              />
            </div>
            {!paymentModal.recordAsExpense && paymentModal.person.type === 'traveller' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">طريقة الدفع</label>
                <select
                  className={fieldClass}
                  value={paymentModal.paymentMethod}
                  onChange={e =>
                    setPaymentModal(m =>
                      m ? { ...m, paymentMethod: e.target.value as AdahiPaymentMethod } : m
                    )
                  }
                >
                  <option value="cash">نقدي</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                </select>
              </div>
            )}
            {createPayment.isError && (
              <p className="text-sm text-red-600">تعذّر الحفظ. تحقق من الاتصال أو الصلاحيات.</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
                disabled={createPayment.isPending}
                onClick={() => {
                  createPayment.reset()
                  setPaymentModal(null)
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-emerald-800"
                disabled={createPayment.isPending}
                onClick={() => {
                  const amt = Number(paymentModal.amount)
                  const description = paymentModal.description.trim() || DEFAULT_DESC
                  if (!Number.isFinite(amt) || amt <= 0) return
                  createPayment.mutate({
                    person: paymentModal.person,
                    amount: amt,
                    description,
                    paymentMethod: paymentModal.paymentMethod,
                    recordAsExpense: paymentModal.recordAsExpense,
                  })
                }}
              >
                {createPayment.isPending ? 'جارٍ الحفظ...' : 'تأكيد وتسجيل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
