// src/pages/AccountingPage.tsx
// Full accounting page: Invoices | Receipts | Expenses tabs
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, FileText, Receipt as ReceiptIcon, TrendingDown } from 'lucide-react'
import type { Invoice, Receipt, Expense, Traveller, Trip, Account, ExpenseCategory } from '../types'

type Tab = 'invoices' | 'receipts' | 'expenses'
type Currency = 'BHD' | 'SAR'

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('invoices')

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-800">المحاسبة</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
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
            }`}
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

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*, traveller:travellers(full_name_ar), trip:trips(trip_name), account:accounts(name)')
        .order('issue_date', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: travellers = [] } = useQuery({ queryKey: ['travellers-list'], queryFn: fetchTravellers })
  const { data: trips = [] }      = useQuery({ queryKey: ['trips-list'],      queryFn: fetchTrips })
  const { data: accounts = [] }   = useQuery({ queryKey: ['accounts-list'],   queryFn: fetchAccounts })

  const save = useMutation({
    mutationFn: async (inv: Partial<Invoice>) => {
      const num = await nextNumber('invoices', 'invoice_number', 'INV')
      await supabase.from('invoices').insert({ ...inv, invoice_number: num }).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); setModal(false) },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('invoices').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })

  const totalUnpaid = invoices.filter(i => i.status !== 'paid').reduce((s: number, i: any) => s + (i.amount - i.amount_paid), 0)
  const selectedCurrency = (sel.currency ?? 'BHD') as Currency
  const filteredAccounts = accounts.filter((a: Account) => a.currency === selectedCurrency)

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-600 font-medium">المستحق: {totalUnpaid.toFixed(3)} BHD</p>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> فاتورة جديدة
        </button>
      </div>

      <AccountingTable
        columns={['رقم الفاتورة', 'المسافر', 'الرحلة', 'الحساب', 'المبلغ', 'المدفوع', 'الحالة']}
        rows={invoices.map((i: any) => [
          i.invoice_number ?? '—',
          i.traveller?.full_name_ar ?? '—',
          i.trip?.trip_name ?? '—',
          i.account?.name ?? '—',
          `${Number(i.amount).toFixed(3)} ${i.currency ?? 'BHD'}`,
          `${Number(i.amount_paid).toFixed(3)} ${i.currency ?? 'BHD'}`,
          <StatusBadge status={i.status} />,
        ])}
        onDelete={id => window.confirm('حذف الفاتورة؟') && del.mutate(invoices[id].id)}
      />

      {modal && (
        <Modal title="فاتورة جديدة" onClose={() => setModal(false)} onSave={() => save.mutate(sel)} saving={save.isPending}>
          <Select label="المسافر" value={sel.traveller_id ?? ''}
            onChange={v => setSel(s => ({ ...s, traveller_id: v }))}
            options={travellers.map((t: Traveller) => ({ value: t.id, label: t.full_name_ar }))} />
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

  const { data: receipts = [] } = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('receipts')
        .select('*, traveller:travellers(full_name_ar), invoice:invoices(invoice_number), account:accounts(name)')
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

  const save = useMutation({
    mutationFn: async (r: Partial<Receipt>) => {
      const num = await nextNumber('receipts', 'receipt_number', 'RCP')
      await supabase.from('receipts').insert({ ...r, receipt_number: num }).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['receipts', 'invoices', 'accounts-list'] }); setModal(false) },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('receipts').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receipts'] }),
  })

  return (
    <>
      <div className="flex justify-end">
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> إيصال دفع جديد
        </button>
      </div>

      <AccountingTable
        columns={['رقم الإيصال', 'المسافر', 'الفاتورة', 'الحساب', 'المبلغ', 'طريقة الدفع', 'التاريخ']}
        rows={receipts.map((r: any) => [
          r.receipt_number ?? '—',
          r.traveller?.full_name_ar ?? '—',
          r.invoice?.invoice_number ?? '—',
          r.account?.name ?? '—',
          `${Number(r.amount).toFixed(3)} ${r.currency ?? 'BHD'}`,
          PAYMENT_LABELS[r.payment_method as string] ?? r.payment_method,
          r.payment_date,
        ])}
        onDelete={id => window.confirm('حذف الإيصال؟') && del.mutate(receipts[id].id)}
      />

      {modal && (
        <Modal title="إيصال دفع جديد" onClose={() => setModal(false)} onSave={() => save.mutate(sel)} saving={save.isPending}>
          <Select label="المسافر" value={sel.traveller_id ?? ''}
            onChange={v => setSel(s => ({ ...s, traveller_id: v }))}
            options={travellers.map((t: Traveller) => ({ value: t.id, label: t.full_name_ar }))} />
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

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*, account:accounts(name), trip:trips(trip_name)')
        .order('expense_date', { ascending: false })
      return (data ?? []) as any[]
    },
  })

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts-list'], queryFn: fetchAccounts })
  const { data: trips = [] }    = useQuery({ queryKey: ['trips-list'],    queryFn: fetchTrips })
  const selectedCurrency = (sel.currency ?? 'BHD') as Currency
  const filteredAccounts = accounts.filter((a: Account) => a.currency === selectedCurrency)

  const save = useMutation({
    mutationFn: async (e: Partial<Expense>) => {
      const num = await nextNumber('expenses', 'expense_number', 'EXP')
      await supabase.from('expenses').insert({ ...e, expense_number: num }).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses', 'accounts-list'] }); setModal(false) },
  })

  const del = useMutation({
    mutationFn: (id: string) => supabase.from('expenses').delete().eq('id', id).throwOnError(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0)

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-red-600 font-medium">إجمالي المصروفات: {totalExpenses.toFixed(3)} BHD</p>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> مصروف جديد
        </button>
      </div>

      <AccountingTable
        columns={['رقم المصروف', 'الوصف', 'الحساب', 'الرحلة', 'الفئة', 'المبلغ', 'التاريخ']}
        rows={expenses.map((e: any) => [
          e.expense_number ?? '—',
          e.description,
          e.account?.name ?? '—',
          e.trip?.trip_name ?? '—',
          CATEGORY_LABELS[e.category as string] ?? e.category ?? '—',
          `${Number(e.amount).toFixed(3)} BHD`,
          e.expense_date,
        ])}
        onDelete={id => window.confirm('حذف المصروف؟') && del.mutate(expenses[id].id)}
      />

      {modal && (
        <Modal title="مصروف جديد" onClose={() => setModal(false)} onSave={() => save.mutate(sel)} saving={save.isPending}>
          <Input label="الوصف *" value={sel.description ?? ''}
            onChange={v => setSel(s => ({ ...s, description: v }))} />
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

function today() { return new Date().toISOString().slice(0, 10) }

async function fetchTravellers() {
  const { data } = await supabase.from('travellers').select('id, full_name_ar').order('full_name_ar')
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
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800', unpaid: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800', cancelled: 'bg-gray-100 text-gray-600',
  }
  const lbl: Record<string, string> = { paid: 'مدفوعة', unpaid: 'غير مدفوعة', partial: 'جزئي', cancelled: 'ملغاة' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? ''}`}>{lbl[status] ?? status}</span>
}

function AccountingTable({ columns, rows, onDelete }: { columns: string[]; rows: React.ReactNode[][]; onDelete: (i: number) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-gray-400">لا توجد بيانات</div>
      ) : (
        <table className="w-full text-sm">
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
                  <button onClick={() => onDelete(i)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto" dir="rtl">
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
