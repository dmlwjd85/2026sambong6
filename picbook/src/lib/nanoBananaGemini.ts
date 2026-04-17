type GeminiInlineData = {
  mimeType?: string
  mime_type?: string
  data?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[]
  }
}

type GeminiGenerateContentResponse = {
  candidates?: GeminiCandidate[]
  error?: { message?: string; code?: number; status?: string }
}

function toImageDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`
}

function extractFirstInlineImageDataUrl(resp: GeminiGenerateContentResponse): string | null {
  const parts = resp.candidates?.flatMap((c) => c.content?.parts ?? []) ?? []
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data
    const data = inline?.data
    const mime = inline?.mimeType ?? inline?.mime_type
    if (data && mime) return toImageDataUrl(mime, data)
  }
  return null
}

export async function generateNanoBananaImageDataUrl(input: {
  apiKey: string
  model: string
  prompt: string
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    input.model,
  )}:generateContent?key=${encodeURIComponent(input.apiKey)}`

  // 공식 가이드: 이미지 출력을 위해 responseModalities에 IMAGE를 포함합니다.
  // 문서: https://ai.google.dev/gemini-api/docs/image-generation
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as GeminiGenerateContentResponse
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  const dataUrl = extractFirstInlineImageDataUrl(json)
  if (!dataUrl) {
    throw new Error('Gemini 응답에서 이미지(inlineData)를 찾지 못했습니다.')
  }

  return dataUrl
}
