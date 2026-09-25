import { supabase } from './supabase'
import { useAuthStore } from '../store/authStore'

export type CampaignPrintRow = {
  campaign_name_ar: string | null
  license_number: string | null
  logo_url: string | null
}

export const CAMPAIGN_PRINT_QUERY_KEY = ['campaign-print-header', 'by-user-id'] as const

export function campaignHeaderText(row: CampaignPrintRow | null | undefined): string {
  const name = (row?.campaign_name_ar ?? '').trim()
  const license = (row?.license_number ?? '').trim()
  if (!name) return ''
  if (!license) return name
  return `${name} - رقم الرخصة ${license}`
}

async function currentUserCampaignId(): Promise<string | null> {
  const storeUser = useAuthStore.getState().user
  const fromStore = storeUser?.campaign_id?.trim()
  if (fromStore) return fromStore

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  const fromJwt = (session?.user.app_metadata?.campaign_id as string | undefined)?.trim()
  if (fromJwt) return fromJwt

  const userId = session?.user.id ?? storeUser?.id
  if (!userId) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('campaign_id')
    .eq('id', userId)
    .maybeSingle()
  return (profile?.campaign_id as string | undefined)?.trim() || null
}

export async function fetchCampaignPrintRow(): Promise<CampaignPrintRow | null> {
  const campaignId = await currentUserCampaignId()
  if (!campaignId) return null

  const { data, error } = await supabase
    .from('campaigns')
    .select('campaign_name_ar, license_number, logo_url')
    .eq('id', campaignId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as CampaignPrintRow | null
}

export function waitForLogo(logoUrl: string | null | undefined): Promise<void> {
  const src = (logoUrl ?? '').trim()
  if (!src) return Promise.resolve()
  return new Promise(resolve => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    const img = new Image()
    img.onload = done
    img.onerror = done
    img.src = src
    if (img.complete) done()
    setTimeout(done, 2000)
  })
}

export function applyDocumentTitle(name: string | null | undefined) {
  document.title = (name ?? '').trim()
}
