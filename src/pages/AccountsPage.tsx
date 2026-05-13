// src/pages/AccountsPage.tsx
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, ArrowLeftRight, TrendingUp, List, X, Edit2, Trash2 } from 'lucide-react'
import type { Account } from '../types'

function formatMoney(value: number, currency: string | undefined) {
  const c = currency ?? 'BHD'
  if (c === 'SAR') {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export default function AccountsPage() {
  const qc = useQueryClient()
  const [addModal, setAddModal] = useState(false)
  const [transferModal, setTransfer] = useState(false)
  const [incomeModal, setIncome] = useState(false)
  const [newAcc, setNewAcc] = useState<Partial<Account>>({ account_type: 'bank', currency: 'BHD' })
  const [xfer, setXfer] = useState({ from: '', to: '', amount: '', exchangeRate: '1', notes: '' })
  const [inc, setInc] = useState({ account_id: '', amount: '', notes: '' })
  const [transactionsForAccount, setTransactionsForAccount] = useState<Account | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').order('name')
      return (data ?? []) as Account[]
    },
  })

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0)

  const createAcc = useMutation({
    mutationFn: async (a: Partial<Account>) => {
      const opening = Number(a.opening_balance ?? a.balance ?? 0)
      const balance = Number(a.balance ?? opening)
      await supabase.from('accounts').insert({
        ...a,
        opening_balance: opening,
        balance,
      }).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-list'] }); setAddModal(false) },
  })

  const transfer = useMutation({
    mutationFn: async () => {
      if (!xfer.from || !xfer.to || xfer.from === xfer.to) throw new Error('اختر حسابين مختلفين')
      const fromAcc = accounts.find(a => a.id === xfer.from)
      const toAcc = accounts.find(a => a.id === xfer.to)
      if (!fromAcc || !toAcc) throw new Error('تعذر تحديد الحسابات')
      const fromAmount = Number(xfer.amount)
      if (!Number.isFinite(fromAmount) || fromAmount <= 0) throw new Error('أدخل مبلغاً صالحاً أكبر من صفر')

      const differentCurrency = fromAcc.currency !== toAcc.currency
      let exchangeRate = differentCurrency ? Number(String(xfer.exchangeRate).trim()) : 1
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) exchangeRate = 1
      const toAmount = fromAmount * exchangeRate

      await supabase.from('account_transfers').insert({
        from_account_id: xfer.from,
        to_account_id: xfer.to,
        amount: fromAmount,
        to_amount: toAmount,
        exchange_rate: exchangeRate,
        notes: xfer.notes.trim() || null,
        transfer_date: new Date().toISOString().slice(0, 10),
      }).throwOnError()

      const { data: fromRow } = await supabase.from('accounts').select('balance').eq('id', xfer.from).single().throwOnError()
      const { data: toRow } = await supabase.from('accounts').select('balance').eq('id', xfer.to).single().throwOnError()
      await supabase
        .from('accounts')
        .update({ balance: Number(fromRow?.balance ?? 0) - fromAmount })
        .eq('id', xfer.from)
        .throwOnError()
      await supabase
        .from('accounts')
        .update({ balance: Number(toRow?.balance ?? 0) + toAmount })
        .eq('id', xfer.to)
        .throwOnError()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setTransfer(false)
      setXfer({ from: '', to: '', amount: '', exchangeRate: '1', notes: '' })
    },
    onError: (e: Error) => window.alert(e.message),
  })

  useEffect(() => {
    const fromAcc = accounts.find(a => a.id === xfer.from)
    const toAcc = accounts.find(a => a.id === xfer.to)
    if (fromAcc && toAcc && fromAcc.currency === toAcc.currency) {
      setXfer(s => (s.exchangeRate === '1' ? s : { ...s, exchangeRate: '1' }))
    }
  }, [xfer.from, xfer.to, accounts])

  const addIncome = useMutation({
    mutationFn: async () => {
      const { data: acc } = await supabase.from('accounts').select('balance').eq('id', inc.account_id).single()
      await supabase.from('accounts')
        .update({ balance: Number(acc?.balance ?? 0) + +inc.amount })
        .eq('id', inc.account_id).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-list'] }); setIncome(false) },
  })

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الحسابات</h1>
          <p className="text-sm text-emerald-700 font-medium mt-0.5">
            إجمالي الأرصدة: {formatMoney(totalBalance, 'BHD')} BHD
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => setIncome(true)}
            className="flex items-center gap-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-lg text-sm font-medium">
            <TrendingUp size={15} /> إيداع
          </button>
          <button
            onClick={() => {
              setXfer({ from: '', to: '', amount: '', exchangeRate: '1', notes: '' })
              setTransfer(true)
            }}
            className="flex items-center gap-2 border border-blue-500 text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowLeftRight size={15} /> تحويل
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> حساب جديد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{acc.account_type === 'cash' ? '💵' : '🏦'}</span>
                <span className="font-bold text-gray-800">{acc.name}</span>
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {acc.account_type === 'cash' ? 'صندوق' : 'بنك'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400">الرصيد الحالي</p>
              <p className={`text-2xl font-bold mt-0.5 ${Number(acc.balance) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {formatMoney(Number(acc.balance), acc.currency)}
                <span className="text-sm font-normal text-gray-400 mr-1">{acc.currency}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTransactionsForAccount(acc)}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-lg text-sm font-medium"
            >
              <List size={16} /> المعاملات
            </button>
          </div>
        ))}
      </div>

      {addModal && (
        <SimpleModal title="إضافة حساب جديد" onClose={() => setAddModal(false)}
          onSave={() => createAcc.mutate(newAcc)} saving={createAcc.isPending}>
          <LabelInput label="اسم الحساب *" value={newAcc.name ?? ''}
            onChange={v => setNewAcc(s => ({ ...s, name: v }))} />
          <LabelSelect label="نوع الحساب" value={newAcc.account_type ?? 'bank'}
            onChange={v => setNewAcc(s => ({ ...s, account_type: v as any }))}
            options={[{ value: 'bank', label: 'بنك' }, { value: 'cash', label: 'صندوق' }]} />
          <LabelSelect label="العملة" value={newAcc.currency ?? 'BHD'}
            onChange={v => setNewAcc(s => ({ ...s, currency: v }))}
            options={[{ value: 'BHD', label: 'BHD' }, { value: 'SAR', label: 'SAR' }]} />
          <LabelInput label="الرصيد الافتتاحي" type="number" value={String(newAcc.balance ?? 0)}
            onChange={v => setNewAcc(s => ({ ...s, balance: +v }))} />
        </SimpleModal>
      )}

      {transferModal && (() => {
        const fromAcc = accounts.find(a => a.id === xfer.from)
        const toAcc = accounts.find(a => a.id === xfer.to)
        const needsFx = !!(fromAcc && toAcc && fromAcc.currency !== toAcc.currency)
        let effRate = needsFx ? Number(String(xfer.exchangeRate).trim()) : 1
        if (!Number.isFinite(effRate) || effRate <= 0) effRate = 1
        const fromAmount = Number(xfer.amount)
        const toAmount = Number.isFinite(fromAmount) ? fromAmount * effRate : NaN
        return (
          <SimpleModal title="تحويل بين الحسابات" onClose={() => setTransfer(false)}
            onSave={() => transfer.mutate()} saving={transfer.isPending}>
            <LabelSelect label="من حساب" value={xfer.from}
              onChange={v => setXfer(s => ({ ...s, from: v }))}
              options={accounts.map(a => ({ value: a.id, label: `${a.name} (${formatMoney(Number(a.balance), a.currency)} ${a.currency})` }))} />
            <LabelSelect label="إلى حساب" value={xfer.to}
              onChange={v => setXfer(s => ({ ...s, to: v }))}
              options={accounts.filter(a => a.id !== xfer.from).map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
            <LabelInput
              label={fromAcc ? `المبلغ المحوّل من الحساب المصدر (${fromAcc.currency}) *` : 'المبلغ *'}
              type="number"
              value={xfer.amount}
              onChange={v => setXfer(s => ({ ...s, amount: v }))}
            />
            {needsFx && (
              <>
                <LabelInput
                  label={`سعر التحويل (المبلغ × السعر = المبلغ بالعملة ${toAcc?.currency ?? ''}) *`}
                  type="number"
                  value={xfer.exchangeRate}
                  onChange={v => setXfer(s => ({ ...s, exchangeRate: v }))}
                />
                <p className="text-xs text-gray-500 leading-relaxed">
                  مثال: 100 {fromAcc?.currency} بسعر 10 = 1000 {toAcc?.currency} تُضاف للحساب الوجهة.
                </p>
                {Number.isFinite(toAmount) && (
                  <p className="text-sm font-medium text-emerald-800">
                    المبلغ المضاف للحساب الوجهة: {formatMoney(toAmount, toAcc?.currency)} {toAcc?.currency}
                  </p>
                )}
              </>
            )}
            <LabelInput label="ملاحظات" value={xfer.notes}
              onChange={v => setXfer(s => ({ ...s, notes: v }))} />
          </SimpleModal>
        )
      })()}

      {incomeModal && (
        <SimpleModal title="إيداع مبلغ" onClose={() => setIncome(false)}
          onSave={() => addIncome.mutate()} saving={addIncome.isPending}>
          <LabelSelect label="الحساب" value={inc.account_id}
            onChange={v => setInc(s => ({ ...s, account_id: v }))}
            options={accounts.map(a => ({ value: a.id, label: a.name }))} />
          <LabelInput label="المبلغ *" type="number" value={inc.amount}
            onChange={v => setInc(s => ({ ...s, amount: v }))} />
          <LabelInput label="ملاحظات" value={inc.notes}
            onChange={v => setInc(s => ({ ...s, notes: v }))} />
        </SimpleModal>
      )}

      {transactionsForAccount && (
        <AccountTransactionsModal
          account={transactionsForAccount}
          accounts={accounts}
          onClose={() => setTransactionsForAccount(null)}
        />
      )}
    </div>
  )
}

type EditKind = 'receipt' | 'expense' | 'transfer'

function AccountTransactionsModal({
  account,
  accounts,
  onClose,
}: {
  account: Account
  accounts: Account[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const id = account.id
  const accName = (aid: string) => accounts.find(a => a.id === aid)?.name ?? '—'

  const { data: txReceipts = [], isLoading: loadR } = useQuery({
    queryKey: ['account-receipts', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('receipts')
        .select('*, traveller:travellers(full_name_ar)')
        .eq('account_id', id)
        .order('payment_date', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const { data: txExpenses = [], isLoading: loadE } = useQuery({
    queryKey: ['account-expenses', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('account_id', id)
        .order('expense_date', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const { data: txTransfers = [], isLoading: loadT } = useQuery({
    queryKey: ['account-transfers', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('account_transfers')
        .select('*')
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`)
        .order('transfer_date', { ascending: false })
      return (data ?? []) as any[]
    },
    enabled: !!id,
  })

  const [edit, setEdit] = useState<null | { kind: EditKind; row: any }>(null)
  const [fAmount, setFAmount] = useState('')
  const [fDate, setFDate] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fExchangeRate, setFExchangeRate] = useState('1')

  useEffect(() => {
    if (!edit) return
    const r = edit.row
    if (edit.kind === 'receipt') {
      setFAmount(String(r.amount ?? ''))
      setFDate(r.payment_date ?? '')
      setFNotes(r.notes ?? '')
    } else if (edit.kind === 'expense') {
      setFAmount(String(r.amount ?? ''))
      setFDate(r.expense_date ?? '')
      setFNotes(r.notes ?? '')
    } else {
      setFAmount(String(r.amount ?? ''))
      setFDate(r.transfer_date ?? '')
      setFNotes(r.notes ?? '')
      setFFrom(r.from_account_id ?? '')
      setFTo(r.to_account_id ?? '')
      setFExchangeRate(String(r.exchange_rate ?? 1))
    }
  }, [edit])

  useEffect(() => {
    if (!edit || edit.kind !== 'transfer') return
    const fromA = accounts.find(a => a.id === fFrom)
    const toA = accounts.find(a => a.id === fTo)
    if (fromA && toA && fromA.currency === toA.currency) {
      setFExchangeRate('1')
    }
  }, [edit, fFrom, fTo, accounts])

  const invalidateTx = () => {
    qc.invalidateQueries({ queryKey: ['account-receipts', id] })
    qc.invalidateQueries({ queryKey: ['account-expenses', id] })
    qc.invalidateQueries({ queryKey: ['account-transfers', id] })
    qc.invalidateQueries({ queryKey: ['accounts-list'] })
    qc.invalidateQueries({ queryKey: ['receipts'] })
    qc.invalidateQueries({ queryKey: ['expenses'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  const invalidateAccountsBalances = () => {
    qc.invalidateQueries({ queryKey: ['accounts-list'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
  }

  const deleteReceipt = useMutation({
    mutationFn: async (receiptId: string) => {
      await supabase.from('receipts').delete().eq('id', receiptId).throwOnError()
    },
    onSuccess: () => {
      invalidateTx()
      invalidateAccountsBalances()
    },
  })

  const deleteExpense = useMutation({
    mutationFn: async (expenseId: string) => {
      await supabase.from('expenses').delete().eq('id', expenseId).throwOnError()
    },
    onSuccess: () => {
      invalidateTx()
      invalidateAccountsBalances()
    },
  })

  const deleteTransfer = useMutation({
    mutationFn: async (transferId: string) => {
      const { data: row, error: fetchErr } = await supabase
        .from('account_transfers')
        .select('from_account_id, to_account_id, amount, to_amount')
        .eq('id', transferId)
        .single()
      if (fetchErr) throw fetchErr
      if (!row) return
      const debit = Number((row as any).amount ?? 0)
      const credit = Number((row as any).to_amount ?? (row as any).amount ?? 0)
      const { data: fromRow } = await supabase.from('accounts').select('balance').eq('id', (row as any).from_account_id).single().throwOnError()
      const { data: toRow } = await supabase.from('accounts').select('balance').eq('id', (row as any).to_account_id).single().throwOnError()
      await supabase
        .from('accounts')
        .update({ balance: Number(fromRow?.balance ?? 0) + debit })
        .eq('id', (row as any).from_account_id)
        .throwOnError()
      await supabase
        .from('accounts')
        .update({ balance: Number(toRow?.balance ?? 0) - credit })
        .eq('id', (row as any).to_account_id)
        .throwOnError()
      await supabase.from('account_transfers').delete().eq('id', transferId).throwOnError()
    },
    onSuccess: () => {
      invalidateTx()
      invalidateAccountsBalances()
    },
  })

  const confirmDeleteReceipt = (r: any) => {
    if (!window.confirm('حذف هذا الإيصال؟')) return
    deleteReceipt.mutate(r.id)
  }
  const confirmDeleteExpense = (e: any) => {
    if (!window.confirm('حذف هذا المصروف؟')) return
    deleteExpense.mutate(e.id)
  }
  const confirmDeleteTransfer = (t: any) => {
    if (!window.confirm('حذف هذا التحويل وعكس أثره على الأرصدة؟')) return
    deleteTransfer.mutate(t.id)
  }

  const deleting = deleteReceipt.isPending || deleteExpense.isPending || deleteTransfer.isPending

  const saveReceipt = useMutation({
    mutationFn: async () => {
      if (!edit || edit.kind !== 'receipt') return
      await supabase
        .from('receipts')
        .update({
          amount: +fAmount,
          payment_date: fDate,
          notes: fNotes.trim() || null,
        })
        .eq('id', edit.row.id)
        .throwOnError()
    },
    onSuccess: () => { invalidateTx(); setEdit(null) },
  })

  const saveExpense = useMutation({
    mutationFn: async () => {
      if (!edit || edit.kind !== 'expense') return
      await supabase
        .from('expenses')
        .update({
          amount: +fAmount,
          expense_date: fDate,
          notes: fNotes.trim() || null,
        })
        .eq('id', edit.row.id)
        .throwOnError()
    },
    onSuccess: () => { invalidateTx(); setEdit(null) },
  })

  const saveTransfer = useMutation({
    mutationFn: async () => {
      if (!edit || edit.kind !== 'transfer') return
      if (!fFrom || !fTo || fFrom === fTo) throw new Error('اختر حسابين مختلفين')
      const fromA = accounts.find(a => a.id === fFrom)
      const toA = accounts.find(a => a.id === fTo)
      if (!fromA || !toA) throw new Error('تعذر تحديد الحسابات')
      const fromAmt = +fAmount
      const needsFx = fromA.currency !== toA.currency
      const er = needsFx ? Number(fExchangeRate) : 1
      if (needsFx && (!Number.isFinite(er) || er <= 0)) throw new Error('أدخل سعر تحويل صالحاً')
      const toAmt = fromAmt * er
      await supabase
        .from('account_transfers')
        .update({
          from_account_id: fFrom,
          to_account_id: fTo,
          amount: fromAmt,
          to_amount: toAmt,
          exchange_rate: er,
          transfer_date: fDate,
          notes: fNotes.trim() || null,
        })
        .eq('id', edit.row.id)
        .throwOnError()
    },
    onSuccess: () => { invalidateTx(); setEdit(null) },
    onError: (e: Error) => window.alert(e.message),
  })

  const saving = saveReceipt.isPending || saveExpense.isPending || saveTransfer.isPending

  const openEdit = (kind: EditKind, row: any) => setEdit({ kind, row })

  const submitEdit = () => {
    if (!edit) return
    if (fAmount === '' || Number.isNaN(+fAmount) || !fDate) {
      window.alert('يرجى إدخال مبلغ وتاريخ صالحين')
      return
    }
    if (edit.kind === 'transfer' && (!fFrom || !fTo || fFrom === fTo)) {
      window.alert('يرجى اختيار حسابين مختلفين للتحويل')
      return
    }
    if (edit.kind === 'transfer') {
      const fromA = accounts.find(a => a.id === fFrom)
      const toA = accounts.find(a => a.id === fTo)
      if (fromA && toA && fromA.currency !== toA.currency) {
        const er = Number(fExchangeRate)
        if (!Number.isFinite(er) || er <= 0) {
          window.alert('يرجى إدخال سعر تحويل صالح أكبر من صفر')
          return
        }
      }
    }
    if (edit.kind === 'receipt') saveReceipt.mutate()
    else if (edit.kind === 'expense') saveExpense.mutate()
    else saveTransfer.mutate()
  }

  const loading = loadR || loadE || loadT

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 p-0 md:p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl min-h-full md:min-h-0 md:max-h-[92vh] md:rounded-2xl md:shadow-2xl flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-6 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">المعاملات — {account.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">إيصالات، مصروفات، وتحويلات مرتبطة بهذا الحساب</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="إغلاق">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5 space-y-8">
          {loading && <p className="text-sm text-gray-500 text-center py-6">جارٍ التحميل...</p>}

          {!loading && (
            <>
              <section>
                <h3 className="text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2">وارد — إيصالات الدفع</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-right px-3 py-2 font-medium">رقم الإيصال</th>
                        <th className="text-right px-3 py-2 font-medium">اسم الحاج</th>
                        <th className="text-right px-3 py-2 font-medium">المبلغ</th>
                        <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                        <th className="text-center px-2 py-2 w-24 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txReceipts.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">لا توجد إيصالات</td></tr>
                      ) : txReceipts.map((r: any) => (
                        <tr key={r.id} className="hover:bg-gray-50/80">
                          <td className="px-3 py-2 font-mono text-xs">{r.receipt_number ?? '—'}</td>
                          <td className="px-3 py-2">{r.traveller?.full_name_ar ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatMoney(Number(r.amount), r.currency)} {r.currency ?? 'BHD'}</td>
                          <td className="px-3 py-2">{r.payment_date ?? '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" disabled={deleting} onClick={() => openEdit('receipt', r)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-40" title="تعديل">
                                <Edit2 size={15} />
                              </button>
                              <button type="button" disabled={deleting} onClick={() => confirmDeleteReceipt(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40" title="حذف">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-red-800 mb-2">صادر — المصروفات</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-right px-3 py-2 font-medium">رقم المصروف</th>
                        <th className="text-right px-3 py-2 font-medium">الوصف</th>
                        <th className="text-right px-3 py-2 font-medium">المبلغ</th>
                        <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                        <th className="text-center px-2 py-2 w-24 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txExpenses.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">لا توجد مصروفات</td></tr>
                      ) : txExpenses.map((e: any) => (
                        <tr key={e.id} className="hover:bg-gray-50/80">
                          <td className="px-3 py-2 font-mono text-xs">{e.expense_number ?? '—'}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{e.description ?? '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatMoney(Number(e.amount), e.currency)} {e.currency ?? 'BHD'}</td>
                          <td className="px-3 py-2">{e.expense_date ?? '—'}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" disabled={deleting} onClick={() => openEdit('expense', e)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-40" title="تعديل">
                                <Edit2 size={15} />
                              </button>
                              <button type="button" disabled={deleting} onClick={() => confirmDeleteExpense(e)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40" title="حذف">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-800 mb-2">التحويلات</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-right px-3 py-2 font-medium">الاتجاه</th>
                        <th className="text-right px-3 py-2 font-medium">من / إلى</th>
                        <th className="text-right px-3 py-2 font-medium">المبلغ</th>
                        <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                        <th className="text-center px-2 py-2 w-24 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {txTransfers.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">لا توجد تحويلات</td></tr>
                      ) : txTransfers.map((t: any) => {
                        const out = t.from_account_id === id
                        return (
                          <tr key={t.id} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${out ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {out ? 'صادر' : 'وارد'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              من {accName(t.from_account_id)} — إلى {accName(t.to_account_id)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs">
                              {(() => {
                                const fromCur = accounts.find(a => a.id === t.from_account_id)?.currency ?? 'BHD'
                                const toCur = accounts.find(a => a.id === t.to_account_id)?.currency ?? 'BHD'
                                const fromAmt = Number(t.amount ?? 0)
                                const toAmt = Number(t.to_amount ?? t.amount ?? 0)
                                if (fromCur !== toCur) {
                                  return (
                                    <span>
                                      −{formatMoney(fromAmt, fromCur)} {fromCur} → +{formatMoney(toAmt, toCur)} {toCur}
                                    </span>
                                  )
                                }
                                return out ? (
                                  <>−{formatMoney(fromAmt, fromCur)} {fromCur}</>
                                ) : (
                                  <>+{formatMoney(toAmt, toCur)} {toCur}</>
                                )
                              })()}
                            </td>
                            <td className="px-3 py-2">{t.transfer_date ?? '—'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-0.5">
                                <button type="button" disabled={deleting} onClick={() => openEdit('transfer', t)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-40" title="تعديل">
                                  <Edit2 size={15} />
                                </button>
                                <button type="button" disabled={deleting} onClick={() => confirmDeleteTransfer(t)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40" title="حذف">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" dir="rtl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800">
              {edit.kind === 'receipt' ? 'تعديل إيصال' : edit.kind === 'expense' ? 'تعديل مصروف' : 'تعديل تحويل'}
            </h3>
            <LabelInput
              label={
                edit.kind === 'transfer'
                  ? `المبلغ من الحساب المصدر (${accounts.find(a => a.id === fFrom)?.currency ?? '—'}) *`
                  : 'المبلغ *'
              }
              type="number"
              value={fAmount}
              onChange={setFAmount}
            />
            {edit.kind === 'transfer' && (() => {
              const fromA = accounts.find(a => a.id === fFrom)
              const toA = accounts.find(a => a.id === fTo)
              const needsFx = !!(fromA && toA && fromA.currency !== toA.currency)
              if (!needsFx) return null
              const rate = Number(fExchangeRate)
              const fromAmt = Number(fAmount)
              const toAmt = Number.isFinite(fromAmt) && Number.isFinite(rate) ? fromAmt * rate : NaN
              return (
                <>
                  <LabelInput
                    label={`سعر التحويل (المبلغ × السعر = المبلغ بـ ${toA.currency}) *`}
                    type="number"
                    value={fExchangeRate}
                    onChange={setFExchangeRate}
                  />
                  {Number.isFinite(toAmt) && (
                    <p className="text-sm font-medium text-emerald-800">
                      المبلغ المضاف للوجهة: {formatMoney(toAmt, toA.currency)} {toA.currency}
                    </p>
                  )}
                </>
              )
            })()}
            <LabelInput label={edit.kind === 'expense' ? 'تاريخ المصروف *' : edit.kind === 'receipt' ? 'تاريخ الدفع *' : 'تاريخ التحويل *'} type="date" value={fDate} onChange={setFDate} />
            <LabelInput label="ملاحظات" value={fNotes} onChange={setFNotes} />
            {edit.kind === 'transfer' && (
              <>
                <LabelSelect label="من حساب *" value={fFrom} onChange={setFFrom}
                  options={accounts.map(a => ({ value: a.id, label: a.name }))} />
                <LabelSelect label="إلى حساب *" value={fTo} onChange={setFTo}
                  options={accounts.map(a => ({ value: a.id, label: a.name }))} />
              </>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" disabled={saving || deleting} onClick={submitEdit}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button type="button" onClick={() => setEdit(null)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function LabelInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input className={ic} type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function LabelSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select className={ic} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— اختر —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function SimpleModal({ title, children, onClose, onSave, saving }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-3" dir="rtl">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
        <div className="flex gap-3 pt-2">
          <button onClick={onSave} disabled={saving}
            className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'جارٍ...' : 'حفظ'}
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
