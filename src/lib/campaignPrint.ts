import { supabase } from './supabase'
import { useAuthStore } from '../store/authStore'

export type CampaignPrintRow = {
  campaign_name_ar: string | null
  license_number: string | null
  logo_url: string | null
}

export function campaignHeaderText(row: CampaignPrintRow | null | undefined): string {
  const name = (row?.campaign_name_ar ?? '').trim()
  const license = (row?.license_number ?? '').trim()
  if (!name) return ''
  if (!license) return name
  return `${name} - رقم الرخصة ${license}`
}

async function resolveCampaignId(tripId?: string): Promise<string | null> {
  if (tripId) {
    const { data } = await supabase
      .from('umrah_trips')
      .select('campaign_id')
      .eq('id', tripId)
      .maybeSingle()
    const fromTrip = (data?.campaign_id as string | undefined)?.trim()
    if (fromTrip) return fromTrip
  }

  const fromStore = useAuthStore.getState().user?.campaign_id?.trim()
  if (fromStore) return fromStore

  const { data: sessionData } = await supabase.auth.getSession()
  const fromJwt = (sessionData.session?.user.app_metadata?.campaign_id as string | undefined)?.trim()
  if (fromJwt) return fromJwt

  const userId = sessionData.session?.user.id ?? useAuthStore.getState().user?.id
  if (!userId) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('campaign_id')
    .eq('id', userId)
    .maybeSingle()
  return (profile?.campaign_id as string | undefined)?.trim() || null
}

export async function fetchCampaignPrintRow(tripId?: string): Promise<CampaignPrintRow | null> {
  const campaignId = await resolveCampaignId(tripId)

  if (campaignId) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('campaign_name_ar, license_number, logo_url')
      .eq('id', campaignId)
      .maybeSingle()
    if (error) throw error
    if (data) return data as CampaignPrintRow
  }

  const { data, error } = await supabase
    .from('campaigns')
    .select('campaign_name_ar, license_number, logo_url')
    .limit(1)
  if (error) throw error
  return (data?.[0] ?? null) as CampaignPrintRow | null
}

export function waitForLogo(logoUrl: string | null | undefined): Promise<void> {
  const src = (logoUrl ?? '').trim()
  if (!src) return Promise.resolve()
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}

export function applyDocumentTitle(name: string | null | undefined) {
  const n = (name ?? '').trim()
  document.title = n || 'الحج والعمرة'
}
