// api/scan-passport.ts
// Vercel serverless function: send a passport photo to Claude Vision and
// return structured fields. The Anthropic key stays on the server.

const EXTRACT_PROMPT =
  'Extract these fields from this passport and return ONLY strict minified JSON, no markdown, no explanation: {"full_name_en":..., "full_name_ar":..., "passport_number":..., "cpr_number":..., "nationality":..., "date_of_birth":"YYYY-MM-DD", "gender":"male"|"female", "passport_issue_date":"YYYY-MM-DD", "passport_expiry_date":"YYYY-MM-DD"}. Read the MRZ (machine-readable zone) if present for accuracy. Use null for any field you cannot determine. cpr_number is the Bahraini personal number / CPR printed on the passport (a 9-digit number, often labelled الرقم الشخصي or Personal No. / ID No., and also encoded in the MRZ); use null if not present. passport_issue_date is the printed Date of Issue; passport_expiry_date is the printed Date of Expiry — if the printed expiry is unclear, use the MRZ expiry date. For nationality, give the Arabic nationality word if determinable (e.g. بحريني).'

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unexpected error'
  // Never leak the API key if it somehow appears in an upstream message.
  return raw.replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[redacted]')
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const body = req.body ?? {}
    const image = typeof body.image === 'string' ? body.image.trim() : ''
    const mediaType = typeof body.mediaType === 'string' ? body.mediaType.trim() : 'image/jpeg'

    if (!image) {
      return res.status(400).json({ success: false, error: 'Missing image' })
    }
    if (!ALLOWED_MEDIA.has(mediaType)) {
      return res.status(400).json({ success: false, error: 'Unsupported mediaType' })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Passport scanning is not configured' })
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: image },
              },
              { type: 'text', text: EXTRACT_PROMPT },
            ],
          },
        ],
      }),
    })

    const data = await anthropicRes.json()
    if (!anthropicRes.ok) {
      const apiMsg = typeof data?.error?.message === 'string' ? data.error.message : 'Anthropic API request failed'
      return res.status(500).json({ success: false, error: sanitizeError(new Error(apiMsg)) })
    }

    const textBlock = Array.isArray(data?.content)
      ? data.content.find((block: { type?: string; text?: string }) => block?.type === 'text' && typeof block.text === 'string')
      : null
    const rawText = textBlock?.text
    if (!rawText) {
      return res.status(500).json({ success: false, error: 'Claude returned no text' })
    }

    let parsedFields: unknown
    try {
      parsedFields = JSON.parse(stripCodeFences(rawText))
    } catch {
      return res.status(500).json({ success: false, error: 'Failed to parse passport fields from Claude response' })
    }

    return res.status(200).json({ success: true, data: parsedFields })
  } catch (err) {
    return res.status(500).json({ success: false, error: sanitizeError(err) })
  }
}
