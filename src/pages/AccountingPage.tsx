// src/pages/AccountingPage.tsx
// Full accounting page: Invoices | Receipts | Expenses tabs
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, FileText, Receipt as ReceiptIcon, TrendingDown, Printer, Edit2, Search, Eye } from 'lucide-react'
import type { Invoice, Receipt, Expense, Traveller, Trip, Account, ExpenseCategory } from '../types'

type Tab = 'invoices' | 'receipts' | 'expenses'
type Currency = 'BHD' | 'SAR'
const COMPANY_TITLE = 'حملة العمار للحج والعمرة'
const COMPANY_LOGO_URL = 'https://oogtpuqoggkajzqodtxo.supabase.co/storage/v1/object/public/public-assets/Screenshot%20-%20Edited.png'
const PACKAGE_TYPE_LABELS: Record<string, string> = {
  barr: 'البر',
  tayaran_dammam: 'طيران - الدمام',
  tayaran_bahrain: 'طيران - البحرين',
  tasreeh_only: 'فقط تصريح',
}

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('invoices')

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-800">المحاسبة</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-full md:w-fit overflow-x-auto whitespace-nowrap">
        {([
          ['invoices',  'الفواتير',   <FileText size={15} />],
          ['receipts',  'الإيصالات',  <ReceiptIcon size={15} />],
          ['expenses',  'المصروفات',  <TrendingDown size={15} />],
        ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:text-gray-800'
            } shrink-0`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'invoices'  && <InvoicesTab />}
      {tab === 'receipts'  && <ReceiptsTab />}
      {tab === 'expenses'  && <ExpensesTab />}
    </div>
  )
}

// ── INVOICES ─────────────────────────────────────────────────────────────────
function InvoicesTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [sel, setSel] = useState<Partial<Invoice>>({ currency: 'BHD', status: 'unpaid', issue_date: today() })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [travellerSearch, setTravellerSearch] = useState('')

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*, traveller:travellers(full_name_ar, cpr_number, package_type), trip:trips(trip_name), account:accounts(name), receipts(payment_method)')
        .order('issue_date', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: travellers = [] } = useQuery({ queryKey: ['travellers-list'], queryFn: fetchTravellers })
  const { data: trips = [] }      = useQuery({ queryKey: ['trips-list'],      queryFn: fetchTrips })
  const { data: accounts = [] }   = useQuery({ queryKey: ['accounts-list'],   queryFn: fetchAccounts })

  const save = useMutation({
    mutationFn: async ({ data, editId }: { data: Partial<Invoice>; editId: string | null }) => {
      if (editId) {
        await supabase
          .from('invoices')
          .update({
            ...data,
            due_date: data.due_date || null,
            issue_date: data.issue_date || null,
          })
          .eq('id', editId)
          .throwOnError()
        return
      }
      const num = await nextNumber('invoices', 'invoice_number', 'INV')
      await supabase.from('invoices').insert({ ...data, invoice_number: num }).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setModal(false)
      setEditingId(null)
      setSel({ currency: 'BHD', status: 'unpaid', issue_date: today() })
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('invoices').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })

  const totalUnpaid = invoices.filter(i => i.status !== 'paid').reduce((s: number, i: any) => s + (i.amount - i.amount_paid), 0)
  const selectedCurrency = (sel.currency ?? 'BHD') as Currency
  const filteredAccounts = accounts.filter((a: Account) => a.currency === selectedCurrency)
  const searchTerm = search.trim().toLowerCase()
  const filteredInvoices = searchTerm
    ? invoices.filter((i: any) =>
      (i.traveller?.full_name_ar ?? '').toLowerCase().includes(searchTerm) ||
      (i.traveller?.cpr_number ?? '').toLowerCase().includes(searchTerm))
    : invoices
  const travellerSearchTerm = travellerSearch.trim().toLowerCase()
  const matchingTravellers = travellerSearchTerm
    ? travellers.filter((t: any) =>
      (t.full_name_ar ?? '').toLowerCase().includes(travellerSearchTerm) ||
      (t.cpr_number ?? '').toLowerCase().includes(travellerSearchTerm))
    : travellers
  const printInvoice = (inv: any) => {
    const amount = Number(inv.amount ?? 0)
    const amountPaid = Number(inv.amount_paid ?? 0)
    const remaining = amount - amountPaid
    openPrintWindow({
      docType: 'فاتورة',
      rows: [
        ['رقم الفاتورة', inv.invoice_number ?? '—'],
        ['اسم الحاج', inv.traveller?.full_name_ar ?? '—'],
        ['الباقة', inv.traveller?.package_type ? (PACKAGE_TYPE_LABELS[inv.traveller.package_type] ?? inv.traveller.package_type) : '—'],
        ['المبلغ', `${amount.toFixed(3)} ${inv.currency ?? 'BHD'}`],
        ['المدفوع', `${amountPaid.toFixed(3)} ${inv.currency ?? 'BHD'}`],
        ['المتبقي', `${remaining.toFixed(3)} ${inv.currency ?? 'BHD'}`],
        ['الوصف', inv.description ?? '—'],
        ['تاريخ الإصدار', inv.issue_date ?? '—'],
        ['تاريخ الاستحقاق', inv.due_date ?? '—'],
        ['الحالة', STATUS_TEXT[inv.status as string] ?? inv.status ?? '—'],
      ],
    })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-600 font-medium">المستحق: {totalUnpaid.toFixed(3)} BHD</p>
        <button onClick={() => { setEditingId(null); setSel({ currency: 'BHD', status: 'unpaid', issue_date: today() }); setModal(true) }}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> فاتورة جديدة
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="ابحث باسم الحاج أو رقم البطاقة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <AccountingTable
        columns={['رقم الفاتورة', 'الحاج', 'الرحلة', 'الحساب', 'المبلغ', 'المدفوع', 'الحالة']}
        rows={filteredInvoices.map((i: any) => [
          i.invoice_number ?? '—',
          i.traveller?.full_name_ar ?? '—',
          i.trip?.trip_name ?? '—',
          i.account?.name ?? '—',
          `${Number(i.amount).toFixed(3)} ${i.currency ?? 'BHD'}`,
          `${Number(i.amount_paid).toFixed(3)} ${i.currency ?? 'BHD'}`,
          <StatusBadge status={i.status} />,
        ])}
        onView={id => setViewingInvoice(filteredInvoices[id])}
        onEdit={id => {
          const inv = filteredInvoices[id]
          setEditingId(inv.id)
          setSel({
            traveller_id: inv.traveller_id ?? '',
            trip_id: inv.trip_id ?? '',
            account_id: inv.account_id ?? '',
            amount: Number(inv.amount ?? 0),
            currency: inv.currency ?? 'BHD',
            description: inv.description ?? '',
            due_date: inv.due_date ?? '',
            notes: inv.notes ?? '',
            status: inv.status ?? 'unpaid',
            issue_date: inv.issue_date ?? today(),
            amount_paid: Number(inv.amount_paid ?? 0),
          })
          setTravellerSearch(inv.traveller?.full_name_ar ?? '')
          setModal(true)
        }}
        onPrint={id => printInvoice(filteredInvoices[id])}
        onDelete={id => window.confirm('حذف الفاتورة؟') && del.mutate(filteredInvoices[id].id)}
      />

      {viewingInvoice && (
        <ViewDetailsModal title="تفاصيل الفاتورة" onClose={() => setViewingInvoice(null)}>
          <DetailRow label="رقم الفاتورة" value={viewingInvoice.invoice_number ?? '—'} />
          <DetailRow label="اسم الحاج" value={viewingInvoice.traveller?.full_name_ar ?? '—'} />
          <DetailRow label="رقم البطاقة" value={viewingInvoice.traveller?.cpr_number ?? '—'} />
          <DetailRow label="الباقة" value={viewingInvoice.traveller?.package_type ? (PACKAGE_TYPE_LABELS[viewingInvoice.traveller.package_type] ?? viewingInvoice.traveller.package_type) : '—'} />
          <DetailRow label="الوصف" value={viewingInvoice.description ?? '—'} />
          <DetailRow label="المبلغ" value={`${Number(viewingInvoice.amount ?? 0).toFixed(3)} ${viewingInvoice.currency ?? 'BHD'}`} />
          <DetailRow label="المدفوع" value={`${Number(viewingInvoice.amount_paid ?? 0).toFixed(3)} ${viewingInvoice.currency ?? 'BHD'}`} />
          <DetailRow label="المتبقي" value={`${(Number(viewingInvoice.amount ?? 0) - Number(viewingInvoice.amount_paid ?? 0)).toFixed(3)} ${viewingInvoice.currency ?? 'BHD'}`} />
          <DetailRow label="الحالة" value={STATUS_TEXT[viewingInvoice.status as string] ?? viewingInvoice.status ?? '—'} />
          <DetailRow label="تاريخ الإصدار" value={viewingInvoice.issue_date ?? '—'} />
          <DetailRow label="تاريخ الاستحقاق" value={viewingInvoice.due_date ?? '—'} />
          <DetailRow label="طريقة الدفع" value={PAYMENT_LABELS[viewingInvoice.receipts?.[0]?.payment_method as string] ?? viewingInvoice.receipts?.[0]?.payment_method ?? '—'} />
          <DetailRow label="ملاحظات" value={viewingInvoice.notes ?? '—'} />
        </ViewDetailsModal>
      )}

      {modal && (
        <Modal title={editingId ? 'تعديل الفاتورة' : 'فاتورة جديدة'} onClose={() => { setModal(false); setEditingId(null) }} onSave={() => save.mutate({ data: sel, editId: editingId })} saving={save.isPending}>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">الحاج</label>
            <input
              className={ic}
              value={travellerSearch}
              onChange={e => { setTravellerSearch(e.target.value); setSel(s => ({ ...s, traveller_id: '' })) }}
              placeholder="ابحث باسم الحاج أو رقم البطاقة..."
            />
            {travellerSearch.trim() && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {matchingTravellers.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSel(s => ({ ...s, traveller_id: t.id }))
                      setTravellerSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`)
                    }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t.full_name_ar} <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Select label="الرحلة" value={sel.trip_id ?? ''}
            onChange={v => setSel(s => ({ ...s, trip_id: v }))}
            options={trips.map((t: Trip) => ({ value: t.id, label: t.trip_name }))} />
          <Select label="العملة *" value={selectedCurrency}
            onChange={v => setSel(s => ({ ...s, currency: v as Currency, account_id: '' }))}
            options={[{ value: 'BHD', label: 'BHD' }, { value: 'SAR', label: 'SAR' }]} />
          <Select label="الحساب" value={sel.account_id ?? ''}
            onChange={v => setSel(s => ({ ...s, account_id: v }))}
            options={filteredAccounts.map((a: Account) => ({ value: a.id, label: a.name }))} />
          <Input label={`المبلغ (${selectedCurrency}) *`} type="number" value={String(sel.amount ?? '')}
            onChange={v => setSel(s => ({ ...s, amount: +v }))} />
          <Input label="الوصف" value={sel.description ?? ''}
            onChange={v => setSel(s => ({ ...s, description: v }))} />
          <Input label="تاريخ الاستحقاق" type="date" value={sel.due_date ?? ''}
            onChange={v => setSel(s => ({ ...s, due_date: v }))} />
          <Textarea label="ملاحظات" value={sel.notes ?? ''}
            onChange={v => setSel(s => ({ ...s, notes: v }))} />
        </Modal>
      )}
    </>
  )
}

// ── RECEIPTS ─────────────────────────────────────────────────────────────────
function ReceiptsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [sel, setSel] = useState<Partial<Receipt>>({ currency: 'BHD', payment_method: 'cash', payment_date: today() })
  const [editingReceipt, setEditingReceipt] = useState<any | null>(null)
  const [viewingReceipt, setViewingReceipt] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [travellerSearch, setTravellerSearch] = useState('')

  const { data: receipts = [] } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('receipts')
        .select('*, traveller:travellers(full_name_ar, cpr_number, package_type), invoice:invoices(invoice_number), account:accounts(name)')
        .order('payment_date', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: travellers = [] } = useQuery({ queryKey: ['travellers-list'], queryFn: fetchTravellers })
  const { data: invoices = [] }   = useQuery({ queryKey: ['invoices-list'], queryFn: async () => {
    const { data } = await supabase.from('invoices').select('id, invoice_number').neq('status', 'paid')
    return (data ?? []) as any[]
  }})
  const { data: accounts = [] }   = useQuery({ queryKey: ['accounts-list'], queryFn: fetchAccounts })
  const selectedCurrency = (sel.currency ?? 'BHD') as Currency
  const filteredAccounts = accounts.filter((a: Account) => a.currency === selectedCurrency)
  const searchTerm = search.trim().toLowerCase()
  const filteredReceipts = searchTerm
    ? receipts.filter((r: any) =>
      (r.traveller?.full_name_ar ?? '').toLowerCase().includes(searchTerm) ||
      (r.traveller?.cpr_number ?? '').toLowerCase().includes(searchTerm))
    : receipts
  const travellerSearchTerm = travellerSearch.trim().toLowerCase()
  const matchingTravellers = travellerSearchTerm
    ? travellers.filter((t: any) =>
      (t.full_name_ar ?? '').toLowerCase().includes(travellerSearchTerm) ||
      (t.cpr_number ?? '').toLowerCase().includes(travellerSearchTerm))
    : travellers

  const save = useMutation({
    mutationFn: async ({ data, receipt }: { data: Partial<Receipt>; receipt: any | null }) => {
      if (receipt?.id) {
        await supabase.from('receipts').update({
          ...data,
          traveller_id: data.traveller_id || null,
          invoice_id: data.invoice_id || null,
          account_id: data.account_id || null,
        }).eq('id', receipt.id).throwOnError()
        return
      }
      const num = await nextNumber('receipts', 'receipt_number', 'RCP')
      await supabase.from('receipts').insert({ 
        ...data, 
        receipt_number: num,
        traveller_id: data.traveller_id || null,
        invoice_id:   data.invoice_id   || null,
        account_id:   data.account_id   || null,
      }).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts', 'invoices', 'accounts-list'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setModal(false)
      setEditingReceipt(null)
      setSel({ currency: 'BHD', payment_method: 'cash', payment_date: today() })
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('receipts').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receipts'] }),
  })
  const printReceipt = (rcp: any) => {
    openPrintWindow({
      docType: 'إيصال',
      rows: [
        ['رقم الإيصال', rcp.receipt_number ?? '—'],
        ['اسم الحاج', rcp.traveller?.full_name_ar ?? '—'],
        ['الباقة', rcp.traveller?.package_type ? (PACKAGE_TYPE_LABELS[rcp.traveller.package_type] ?? rcp.traveller.package_type) : '—'],
        ['رقم الفاتورة', rcp.invoice?.invoice_number ?? '—'],
        ['المبلغ', `${Number(rcp.amount ?? 0).toFixed(3)} ${rcp.currency ?? 'BHD'}`],
        ['طريقة الدفع', PAYMENT_LABELS[rcp.payment_method as string] ?? rcp.payment_method ?? '—'],
        ['تاريخ الدفع', rcp.payment_date ?? '—'],
      ],
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <button onClick={() => { setEditingReceipt(null); setSel({ currency: 'BHD', payment_method: 'cash', payment_date: today() }); setModal(true) }}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> إيصال دفع جديد
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="ابحث باسم الحاج أو رقم البطاقة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <AccountingTable
        columns={['رقم الإيصال', 'الحاج', 'الفاتورة', 'الحساب', 'المبلغ', 'طريقة الدفع', 'التاريخ']}
        rows={filteredReceipts.map((r: any) => [
          r.receipt_number ?? '—',
          r.traveller?.full_name_ar ?? '—',
          r.invoice?.invoice_number ?? '—',
          r.account?.name ?? '—',
          `${Number(r.amount).toFixed(3)} ${r.currency ?? 'BHD'}`,
          PAYMENT_LABELS[r.payment_method as string] ?? r.payment_method,
          r.payment_date,
        ])}
        onView={id => setViewingReceipt(filteredReceipts[id])}
        onEdit={id => {
          const r = filteredReceipts[id]
          setEditingReceipt(r)
          setSel({
            traveller_id: r.traveller_id ?? '',
            invoice_id: r.invoice_id ?? '',
            account_id: r.account_id ?? '',
            amount: Number(r.amount ?? 0),
            currency: r.currency ?? 'BHD',
            payment_method: r.payment_method ?? 'cash',
            payment_date: r.payment_date ?? today(),
            notes: r.notes ?? '',
          })
          setTravellerSearch(r.traveller?.full_name_ar ?? '')
          setModal(true)
        }}
        onPrint={id => printReceipt(filteredReceipts[id])}
        onDelete={id => window.confirm('حذف الإيصال؟') && del.mutate(filteredReceipts[id].id)}
      />

      {viewingReceipt && (
        <ViewDetailsModal title="تفاصيل الإيصال" onClose={() => setViewingReceipt(null)}>
          <DetailRow label="رقم الإيصال" value={viewingReceipt.receipt_number ?? '—'} />
          <DetailRow label="اسم الحاج" value={viewingReceipt.traveller?.full_name_ar ?? '—'} />
          <DetailRow label="رقم البطاقة" value={viewingReceipt.traveller?.cpr_number ?? '—'} />
          <DetailRow label="رقم الفاتورة المرتبط" value={viewingReceipt.invoice?.invoice_number ?? '—'} />
          <DetailRow label="المبلغ" value={`${Number(viewingReceipt.amount ?? 0).toFixed(3)} ${viewingReceipt.currency ?? 'BHD'}`} />
          <DetailRow label="طريقة الدفع" value={PAYMENT_LABELS[viewingReceipt.payment_method as string] ?? viewingReceipt.payment_method ?? '—'} />
          <DetailRow label="تاريخ الدفع" value={viewingReceipt.payment_date ?? '—'} />
          <DetailRow label="ملاحظات" value={viewingReceipt.notes ?? '—'} />
        </ViewDetailsModal>
      )}

      {modal && (
        <Modal title={editingReceipt ? 'تعديل الإيصال' : 'إيصال دفع جديد'} onClose={() => { setModal(false); setEditingReceipt(null) }} onSave={() => save.mutate({ data: sel, receipt: editingReceipt })} saving={save.isPending}>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">الحاج</label>
            <input
              className={ic}
              value={travellerSearch}
              onChange={e => { setTravellerSearch(e.target.value); setSel(s => ({ ...s, traveller_id: '' })) }}
              placeholder="ابحث باسم الحاج أو رقم البطاقة..."
            />
            {travellerSearch.trim() && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {matchingTravellers.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSel(s => ({ ...s, traveller_id: t.id }))
                      setTravellerSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`)
                    }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t.full_name_ar} <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Select label="الفاتورة" value={sel.invoice_id ?? ''}
            onChange={v => setSel(s => ({ ...s, invoice_id: v }))}
            options={invoices.map((i: any) => ({ value: i.id, label: i.invoice_number }))} />
          <Select label="العملة *" value={selectedCurrency}
            onChange={v => setSel(s => ({ ...s, currency: v as Currency, account_id: '' }))}
            options={[{ value: 'BHD', label: 'BHD' }, { value: 'SAR', label: 'SAR' }]} />
          <Select label="الحساب *" value={sel.account_id ?? ''}
            onChange={v => setSel(s => ({ ...s, account_id: v }))}
            options={filteredAccounts.map((a: Account) => ({ value: a.id, label: a.name }))} />
          <Input label="المبلغ *" type="number" value={String(sel.amount ?? '')}
            onChange={v => setSel(s => ({ ...s, amount: +v }))} />
          <Select label="طريقة الدفع" value={sel.payment_method ?? 'cash'}
            onChange={v => setSel(s => ({ ...s, payment_method: v as any }))}
            options={[{value:'cash',label:'نقدي'},{value:'bank_transfer',label:'تحويل بنكي'},{value:'cheque',label:'شيك'}]} />
          <Input label="التاريخ" type="date" value={sel.payment_date ?? today()}
            onChange={v => setSel(s => ({ ...s, payment_date: v }))} />
          <Textarea label="ملاحظات" value={sel.notes ?? ''}
            onChange={v => setSel(s => ({ ...s, notes: v }))} />
        </Modal>
      )}
    </>
  )
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────
function ExpensesTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [sel, setSel] = useState<Partial<Expense>>({ currency: 'BHD', expense_date: today() })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [travellerSearch, setTravellerSearch] = useState('')

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*, account:accounts(name), trip:trips(trip_name), traveller:travellers(full_name_ar, cpr_number, package_type)')
        .order('expense_date', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts-list'], queryFn: fetchAccounts })
  const { data: trips = [] }    = useQuery({ queryKey: ['trips-list'],    queryFn: fetchTrips })
  const { data: travellers = [] } = useQuery({ queryKey: ['travellers-list'], queryFn: fetchTravellers })
  const selectedCurrency = (sel.currency ?? 'BHD') as Currency
  const filteredAccounts = accounts.filter((a: Account) => a.currency === selectedCurrency)
  const searchTerm = search.trim().toLowerCase()
  const filteredExpenses = searchTerm
    ? expenses.filter((e: any) =>
      (e.traveller?.full_name_ar ?? '').toLowerCase().includes(searchTerm) ||
      (e.traveller?.cpr_number ?? '').toLowerCase().includes(searchTerm))
    : expenses
  const travellerSearchTerm = travellerSearch.trim().toLowerCase()
  const matchingTravellers = travellerSearchTerm
    ? travellers.filter((t: any) =>
      (t.full_name_ar ?? '').toLowerCase().includes(travellerSearchTerm) ||
      (t.cpr_number ?? '').toLowerCase().includes(travellerSearchTerm))
    : travellers

  const save = useMutation({
    mutationFn: async ({ data, editId }: { data: Partial<Expense>; editId: string | null }) => {
      if (editId) {
        await supabase.from('expenses').update(data).eq('id', editId).throwOnError()
        return
      }
      const num = await nextNumber('expenses', 'expense_number', 'EXP')
      await supabase.from('expenses').insert({ ...data, expense_number: num }).throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', 'accounts-list'] })
      setModal(false)
      setEditingId(null)
      setSel({ currency: 'BHD', expense_date: today() })
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('expenses').delete().eq('id', id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0)
  const printExpense = (exp: any) => {
    openPrintWindow({
      docType: 'سند مصروف',
      rows: [
        ['رقم المصروف', exp.expense_number ?? '—'],
        ['الوصف', exp.description ?? '—'],
        ['الباقة', exp.traveller?.package_type ? (PACKAGE_TYPE_LABELS[exp.traveller.package_type] ?? exp.traveller.package_type) : '—'],
        ['الفئة', CATEGORY_LABELS[exp.category as string] ?? exp.category ?? '—'],
        ['المبلغ', `${Number(exp.amount ?? 0).toFixed(3)} ${exp.currency ?? 'BHD'}`],
        ['تاريخ المصروف', exp.expense_date ?? '—'],
      ],
    })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-600 font-medium">إجمالي المصروفات: {totalExpenses.toFixed(3)} BHD</p>
        <button onClick={() => { setEditingId(null); setSel({ currency: 'BHD', expense_date: today() }); setModal(true) }}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> مصروف جديد
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="ابحث باسم الحاج أو رقم البطاقة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <AccountingTable
        columns={['رقم المصروف', 'الوصف', 'الحساب', 'الرحلة', 'الفئة', 'المبلغ', 'التاريخ']}
        rows={filteredExpenses.map((e: any) => [
          e.expense_number ?? '—',
          e.description,
          e.account?.name ?? '—',
          e.trip?.trip_name ?? '—',
          CATEGORY_LABELS[e.category as string] ?? e.category ?? '—',
          `${Number(e.amount).toFixed(3)} BHD`,
          e.expense_date,
        ])}
        onEdit={id => {
          const e = filteredExpenses[id]
          setEditingId(e.id)
          setSel({
            description: e.description ?? '',
            account_id: e.account_id ?? '',
            trip_id: e.trip_id ?? '',
            amount: Number(e.amount ?? 0),
            currency: e.currency ?? 'BHD',
            category: e.category ?? '',
            expense_date: e.expense_date ?? today(),
            notes: e.notes ?? '',
            traveller_id: e.traveller_id ?? '',
          })
          setTravellerSearch(e.traveller?.full_name_ar ?? '')
          setModal(true)
        }}
        onPrint={id => printExpense(filteredExpenses[id])}
        onDelete={id => window.confirm('حذف المصروف؟') && del.mutate(filteredExpenses[id].id)}
      />

      {modal && (
        <Modal title={editingId ? 'تعديل المصروف' : 'مصروف جديد'} onClose={() => { setModal(false); setEditingId(null) }} onSave={() => save.mutate({ data: sel, editId: editingId })} saving={save.isPending}>
          <Input label="الوصف *" value={sel.description ?? ''}
            onChange={v => setSel(s => ({ ...s, description: v }))} />
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">الحاج (اختياري)</label>
            <input
              className={ic}
              value={travellerSearch}
              onChange={e => { setTravellerSearch(e.target.value); setSel(s => ({ ...s, traveller_id: '' })) }}
              placeholder="ابحث باسم الحاج أو رقم البطاقة..."
            />
            {travellerSearch.trim() && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setSel(s => ({ ...s, traveller_id: null })); setTravellerSearch('') }}
                  className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 text-gray-500"
                >
                  — بدون حاج —
                </button>
                {matchingTravellers.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSel(s => ({ ...s, traveller_id: t.id }))
                      setTravellerSearch(`${t.full_name_ar} — ${t.cpr_number ?? '—'}`)
                    }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {t.full_name_ar} <span className="text-gray-400 text-xs">({t.cpr_number ?? '—'})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Select label="العملة *" value={selectedCurrency}
            onChange={v => setSel(s => ({ ...s, currency: v as Currency, account_id: '' }))}
            options={[{ value: 'BHD', label: 'BHD' }, { value: 'SAR', label: 'SAR' }]} />
          <Select label="الحساب *" value={sel.account_id ?? ''}
            onChange={v => setSel(s => ({ ...s, account_id: v }))}
            options={filteredAccounts.map((a: Account) => ({ value: a.id, label: a.name }))} />
          <Select label="الرحلة" value={sel.trip_id ?? ''}
            onChange={v => setSel(s => ({ ...s, trip_id: v }))}
            options={[{value:'',label:'— بدون رحلة —'}, ...((trips as Trip[]).map(t => ({ value: t.id, label: t.trip_name })))]} />
          <Input label="المبلغ *" type="number" value={String(sel.amount ?? '')}
            onChange={v => setSel(s => ({ ...s, amount: +v }))} />
          <Select label="الفئة" value={sel.category ?? ''}
            onChange={v => setSel(s => ({ ...s, category: v as ExpenseCategory }))}
            options={[
              {value:'hotel',label:'فندق'}, {value:'transport',label:'مواصلات'},
              {value:'food',label:'طعام'}, {value:'visa',label:'تصريح'}, {value:'other',label:'أخرى'},
            ]} />
          <Input label="التاريخ" type="date" value={sel.expense_date ?? today()}
            onChange={v => setSel(s => ({ ...s, expense_date: v }))} />
          <Textarea label="ملاحظات" value={sel.notes ?? ''}
            onChange={v => setSel(s => ({ ...s, notes: v }))} />
        </Modal>
      )}
    </>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────
const PAYMENT_LABELS: Record<string, string> = { cash: 'نقدي', bank_transfer: 'تحويل بنكي', cheque: 'شيك' }
const CATEGORY_LABELS: Record<string, string> = { hotel: 'فندق', transport: 'مواصلات', food: 'طعام', visa: 'تصريح', other: 'أخرى' }
const STATUS_TEXT: Record<string, string> = { paid: 'مدفوعة', unpaid: 'غير مدفوعة', partial: 'جزئية', cancelled: 'ملغاة' }

function today() { return new Date().toISOString().slice(0, 10) }

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function openPrintWindow({ docType, rows }: { docType: string; rows: [string, string][] }) {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return
  const todayText = new Date().toLocaleDateString('ar-BH')
  const tableRows = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '—')}</td></tr>`)
    .join('')

  win.document.write(`
    <!doctype html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(docType)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; font-family: 'Noto Naskh Arabic', Arial, sans-serif; }
        body { margin: 0; padding: 24px; color: #111827; }
        .logo-wrap { text-align: center; margin-bottom: 10px; }
        .logo { height: 80px; width: auto; object-fit: contain; }
        .title { text-align: center; margin-bottom: 4px; font-size: 24px; font-weight: 700; }
        .subtitle { text-align: center; margin-bottom: 2px; font-size: 18px; color: #374151; }
        .date { text-align: center; margin: 0 0 14px; font-size: 13px; color: #6b7280; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 14px; vertical-align: top; }
        th { width: 32%; background: #f3f4f6; text-align: right; }
        td { text-align: right; }
      </style>
    </head>
    <body>
      <div class="logo-wrap">
        <img class="logo" crossorigin="anonymous" src="${COMPANY_LOGO_URL}" alt="Logo" />
      </div>
      <h1 class="title">${COMPANY_TITLE}</h1>
      <h2 class="subtitle">${escapeHtml(docType)}</h2>
      <p class="date">التاريخ: ${escapeHtml(todayText)}</p>
      <table><tbody>${tableRows}</tbody></table>
      <script>window.onload = () => { setTimeout(() => { window.print(); setTimeout(() => window.close(), 500); }, 900); }</script>
    </body>
    </html>
  `)
  win.document.close()
}

async function fetchTravellers() {
  const { data } = await supabase.from('travellers').select('id, full_name_ar, cpr_number').order('full_name_ar')
  return (data ?? []) as Traveller[]
}
async function fetchTrips() {
  const { data } = await supabase.from('trips').select('id, trip_name').order('departure_date', { ascending: false })
  return (data ?? []) as Trip[]
}
async function fetchAccounts() {
  const { data } = await supabase.from('accounts').select('*').order('name')
  return (data ?? []) as Account[]
}

async function nextNumber(table: string, column: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  const fullPrefix = `${prefix}-${year}-`
  const { data } = await supabase
    .from(table)
    .select(column)
    .ilike(column, `${fullPrefix}%`)
    .order(column, { ascending: false })
    .limit(1)
  const last = data?.[0]?.[column]
  const lastNum = last ? parseInt(last.split('-').pop() ?? '0') : 0
  return `${fullPrefix}${String(lastNum + 1).padStart(3, '0')}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800', unpaid: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800', cancelled: 'bg-gray-100 text-gray-600',
  }
  const lbl: Record<string, string> = { paid: 'مدفوعة', unpaid: 'غير مدفوعة', partial: 'جزئي', cancelled: 'ملغاة' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? ''}`}>{lbl[status] ?? status}</span>
}

function AccountingTable({ columns, rows, onDelete, onPrint, onEdit, onView }: { columns: string[]; rows: React.ReactNode[][]; onDelete: (i: number) => void; onPrint: (i: number) => void; onEdit: (i: number) => void; onView?: (i: number) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-gray-400">لا توجد بيانات</div>
      ) : (
        <>
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {columns.map(c => <th key={c} className="text-right px-4 py-3 font-medium text-gray-600">{c}</th>)}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {row.map((cell, j) => <td key={j} className="px-4 py-3 text-gray-700">{cell}</td>)}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {onView && (
                        <button onClick={() => onView(i)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                          <Eye size={14} />
                        </button>
                      )}
                      <button onClick={() => onEdit(i)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => onPrint(i)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Printer size={14} />
                      </button>
                      <button onClick={() => onDelete(i)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="md:hidden p-3 space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3 bg-white shadow-sm">
                <div className="space-y-2 text-sm">
                  {columns.map((col, idx) => (
                    <div key={col} className="flex items-start justify-between gap-3">
                      <span className="text-gray-500 shrink-0">{col}</span>
                      <span className="text-gray-700 text-left">{row[idx]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-1">
                  {onView && (
                    <button onClick={() => onView(i)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                      <Eye size={14} />
                    </button>
                  )}
                  <button onClick={() => onEdit(i)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => onPrint(i)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Printer size={14} />
                  </button>
                  <button onClick={() => onDelete(i)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Mini form helpers ─────────────────────────────────────────────────────────
const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function Input({ label, value, onChange, type='text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input className={ic} type={type} value={value} onChange={e => onChange(e.target.value)} /></div>
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: {value:string;label:string}[] }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <select className={ic} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— اختر —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></div>
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <textarea className={ic + ' resize-none'} rows={2} value={value} onChange={e => onChange(e.target.value)} /></div>
}

function Modal({ title, children, onClose, onSave, saving }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-center md:p-4 z-50">
      <div className="bg-white w-full h-full rounded-none p-6 space-y-3 overflow-y-auto md:h-auto md:max-w-md md:rounded-2xl md:shadow-2xl md:max-h-[90vh]" dir="rtl">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {children}
        <div className="flex gap-3 pt-2">
          <button onClick={onSave} disabled={saving}
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

function ViewDetailsModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-center md:p-4 z-50">
      <div className="bg-white w-full h-full rounded-none p-6 space-y-3 overflow-y-auto md:h-auto md:max-w-md md:rounded-2xl md:shadow-2xl md:max-h-[90vh]" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">إغلاق</button>
        </div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-800 font-medium break-words">{value || '—'}</p>
    </div>
  )
}
