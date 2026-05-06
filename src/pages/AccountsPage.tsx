// src/pages/AccountsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, ArrowLeftRight, TrendingUp } from 'lucide-react'
import type { Account } from '../types'

export default function AccountsPage() {
  const qc = useQueryClient()
  const [addModal, setAddModal]       = useState(false)
  const [transferModal, setTransfer]  = useState(false)
  const [incomeModal, setIncome]      = useState(false)
  const [newAcc, setNewAcc]           = useState<Partial<Account>>({ account_type: 'bank', currency: 'BHD' })
  const [xfer, setXfer]               = useState({ from: '', to: '', amount: '', notes: '' })
  const [inc, setInc]                 = useState({ account_id: '', amount: '', notes: '' })

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('*').order('name')
      return (data ?? []) as Account[]
    },
  })

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0)

  const createAcc = useMutation({
    mutationFn: (a: Partial<Account>) => supabase.from('accounts').insert(a).throwOnError(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-list'] }); setAddModal(false) },
  })

  const transfer = useMutation({
    mutationFn: async () => {
      await supabase.from('account_transfers').insert({
        from_account_id: xfer.from, to_account_id: xfer.to,
        amount: +xfer.amount, notes: xfer.notes || null,
        transfer_date: new Date().toISOString().slice(0, 10),
      }).throwOnError()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts-list'] }); setTransfer(false) },
  })

  const addIncome = useMutation({
    mutationFn: async () => {
      // Direct balance addition (non-invoice income)
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
            إجمالي الأرصدة: {totalBalance.toFixed(3)} BHD
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIncome(true)}
            className="flex items-center gap-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-lg text-sm font-medium">
            <TrendingUp size={15} /> إيداع
          </button>
          <button onClick={() => setTransfer(true)}
            className="flex items-center gap-2 border border-blue-500 text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium">
            <ArrowLeftRight size={15} /> تحويل
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-2 bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Plus size={15} /> حساب جديد
          </button>
        </div>
      </div>

      {/* Account cards */}
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
                {Number(acc.balance).toFixed(3)}
                <span className="text-sm font-normal text-gray-400 mr-1">{acc.currency}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Add account modal */}
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

      {/* Transfer modal */}
      {transferModal && (
        <SimpleModal title="تحويل بين الحسابات" onClose={() => setTransfer(false)}
          onSave={() => transfer.mutate()} saving={transfer.isPending}>
          <LabelSelect label="من حساب" value={xfer.from}
            onChange={v => setXfer(s => ({ ...s, from: v }))}
            options={accounts.map(a => ({ value: a.id, label: `${a.name} (${Number(a.balance).toFixed(3)})` }))} />
          <LabelSelect label="إلى حساب" value={xfer.to}
            onChange={v => setXfer(s => ({ ...s, to: v }))}
            options={accounts.filter(a => a.id !== xfer.from).map(a => ({ value: a.id, label: a.name }))} />
          <LabelInput label="المبلغ *" type="number" value={xfer.amount}
            onChange={v => setXfer(s => ({ ...s, amount: v }))} />
          <LabelInput label="ملاحظات" value={xfer.notes}
            onChange={v => setXfer(s => ({ ...s, notes: v }))} />
        </SimpleModal>
      )}

      {/* Add income modal */}
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
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function LabelInput({ label, value, onChange, type = 'text' }: any) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input className={ic} type={type} value={value} onChange={(e: any) => onChange(e.target.value)} /></div>
}

function LabelSelect({ label, value, onChange, options }: any) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <select className={ic} value={value} onChange={(e: any) => onChange(e.target.value)}>
      <option value="">— اختر —</option>
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></div>
}

function SimpleModal({ title, children, onClose, onSave, saving }: any) {
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
