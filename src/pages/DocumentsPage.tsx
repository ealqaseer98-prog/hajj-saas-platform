// src/pages/DocumentsPage.tsx
// Uses Supabase Storage bucket: traveller-docs
// Setup: Create bucket in Supabase Dashboard > Storage > New Bucket
//   Name: traveller-docs  |  Public: false
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Upload, Trash2, Download, Search, FileText, Eye, Filter } from 'lucide-react'
import type { TravellerDocument, DocType, Traveller } from '../types'

const BUCKET = 'traveller-docs'

const DOC_TYPE_AR: Record<DocType, string> = {
  passport: 'جواز سفر',
  visa:     'تصريح',
  id_card:  'بطاقة شخصية',
  other:    'أخرى',
}

const DOC_TYPE_COLOR: Record<DocType, string> = {
  passport: 'bg-blue-100 text-blue-800',
  visa:     'bg-green-100 text-green-800',
  id_card:  'bg-purple-100 text-purple-800',
  other:    'bg-gray-100 text-gray-700',
}

export default function DocumentsPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search,       setSearch]       = useState('')
  const [docTypeFilter,setDocTypeFilter] = useState<DocType | 'all'>('all')
  const [uploadModal,  setUploadModal]  = useState(false)
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null)
  const [form, setForm] = useState<{
    traveller_id: string; doc_type: DocType; notes: string; file: File | null
  }>({ traveller_id: '', doc_type: 'passport', notes: '', file: null })
  const [uploading, setUploading] = useState(false)

  // Fetch all documents with traveller join
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['traveller-docs', search, docTypeFilter],
    queryFn: async () => {
      let q = supabase.from('traveller_documents')
        .select('*, traveller:travellers(id, full_name_ar, cpr_number)')
        .order('uploaded_at', { ascending: false })
      if (docTypeFilter !== 'all') q = q.eq('doc_type', docTypeFilter)
      if (search.trim()) {
        // Filter by traveller name via join — do client-side after fetch
      }
      const { data } = await q
      let result = (data ?? []) as any[]
      if (search.trim()) {
        result = result.filter((d: any) =>
          d.traveller?.full_name_ar?.includes(search) || d.traveller?.cpr_number?.includes(search)
        )
      }
      return result as (TravellerDocument & { traveller: Traveller | null })[]
    },
  })

  // Travellers dropdown
  const { data: travellers = [] } = useQuery({
    queryKey: ['travellers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('travellers').select('id, full_name_ar, cpr_number').order('full_name_ar')
      return (data ?? []) as Pick<Traveller, 'id' | 'full_name_ar' | 'cpr_number'>[]
    },
  })

  // Upload mutation
  const upload = useMutation({
    mutationFn: async () => {
      if (!form.file || !form.traveller_id) throw new Error('يرجى اختيار ملف وحاج')
      setUploading(true)
      try {
        const ext       = form.file.name.split('.').pop()
        const path      = `${form.traveller_id}/${Date.now()}_${form.doc_type}.${ext}`
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, form.file)
        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        // For private bucket, use createSignedUrl instead:
        // const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)

        await supabase.from('traveller_documents').insert({
          traveller_id: form.traveller_id,
          doc_type:     form.doc_type,
          file_name:    form.file.name,
          file_url:     urlData.publicUrl,
          storage_path: path,
          notes:        form.notes || null,
        }).throwOnError()
      } finally {
        setUploading(false)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traveller-docs'] })
      setUploadModal(false)
      setForm({ traveller_id: '', doc_type: 'passport', notes: '', file: null })
    },
  })

  const deleteDoc = useMutation({
    mutationFn: async (doc: TravellerDocument) => {
      await supabase.storage.from(BUCKET).remove([doc.storage_path])
      await supabase.from('traveller_documents').delete().eq('id', doc.id).throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traveller-docs'] }),
  })

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (data?.signedUrl) setPreviewUrl(data.signedUrl)
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
  const isPdf   = (name: string) => /\.pdf$/i.test(name)

  // Group documents by traveller
  const grouped = documents.reduce((acc: Record<string, any>, doc) => {
    const tid = doc.traveller_id
    if (!acc[tid]) acc[tid] = { traveller: doc.traveller, docs: [] }
    acc[tid].docs.push(doc)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">المستندات والوثائق</h1>
          <p className="text-sm text-gray-500 mt-0.5">رفع وإدارة مستندات الحجاج</p>
        </div>
        <button onClick={() => setUploadModal(true)}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Upload size={15} /> رفع مستند
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="ابحث باسم الحاج أو رقم البطاقة..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'passport', 'visa', 'id_card', 'other'] as const).map(v => (
            <button key={v} onClick={() => setDocTypeFilter(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                docTypeFilter === v ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'all' ? 'الكل' : DOC_TYPE_AR[v as DocType]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(DOC_TYPE_AR).map(([type, label]) => {
          const count = documents.filter(d => d.doc_type === type).length
          return (
            <div key={type} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-xl font-bold text-gray-800">{count}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          )
        })}
      </div>

      {/* Documents grouped by traveller */}
      {isLoading ? (
        <div className="p-10 text-center text-gray-400">جارٍ التحميل...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          لا توجد مستندات مرفوعة
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map((group: any) => (
            <div key={group.traveller?.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-3">
                <p className="font-medium text-gray-800">{group.traveller?.full_name_ar}</p>
                <p className="text-xs text-gray-400 font-mono">{group.traveller?.cpr_number}</p>
              </div>
              <div className="divide-y divide-gray-50">
                {group.docs.map((doc: TravellerDocument) => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="shrink-0">
                      {isImage(doc.file_name)
                        ? <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden">
                            <img src={doc.file_url} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display='none')} />
                          </div>
                        : <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <FileText size={20} className="text-gray-400" />
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DOC_TYPE_COLOR[doc.doc_type as DocType]}`}>
                          {DOC_TYPE_AR[doc.doc_type as DocType]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(doc.uploaded_at).toLocaleDateString('ar-BH')}
                        </span>
                        {doc.notes && <span className="text-xs text-gray-400 truncate">{doc.notes}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => getSignedUrl(doc.storage_path)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="معاينة">
                        <Eye size={14} />
                      </button>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download={doc.file_name}
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="تنزيل">
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => window.confirm('حذف المستند؟') && deleteDoc.mutate(doc)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
            <h2 className="text-lg font-bold text-gray-800">رفع مستند جديد</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الحاج *</label>
              <select className={ic} value={form.traveller_id}
                onChange={e => setForm(f => ({ ...f, traveller_id: e.target.value }))}>
                <option value="">— اختر حاجًا —</option>
                {travellers.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name_ar} ({t.cpr_number})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">نوع المستند *</label>
              <select className={ic} value={form.doc_type}
                onChange={e => setForm(f => ({ ...f, doc_type: e.target.value as DocType }))}>
                {Object.entries(DOC_TYPE_AR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* File picker */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">الملف *</label>
              <input ref={fileInputRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                {form.file ? (
                  <div>
                    <p className="text-sm font-medium text-emerald-700">{form.file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(form.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <Upload size={24} className="mx-auto mb-2" />
                    <p className="text-sm">اضغط لاختيار ملف</p>
                    <p className="text-xs mt-0.5">PDF, JPG, PNG (حتى 10 MB)</p>
                  </div>
                )}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ملاحظات</label>
              <input className={ic} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="مثال: الجواز الأصلي" />
            </div>

            {upload.error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{String(upload.error)}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => upload.mutate()}
                disabled={uploading || !form.file || !form.traveller_id}
                className="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                {uploading ? 'جارٍ الرفع...' : 'رفع المستند'}
              </button>
              <button onClick={() => { setUploadModal(false); setForm({ traveller_id: '', doc_type: 'passport', notes: '', file: null }) }}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setPreviewUrl(null)}>
          <div className="max-w-2xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={previewUrl} alt="معاينة" className="w-full h-auto rounded-xl max-h-[80vh] object-contain" />
            <button onClick={() => setPreviewUrl(null)}
              className="mt-3 w-full bg-white/10 text-white py-2 rounded-lg text-sm hover:bg-white/20">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
