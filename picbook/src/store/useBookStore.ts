import { create } from 'zustand'
import { generateNanoBananaImageDataUrl } from '../lib/nanoBananaGemini'
import { useUiStore } from './useUiStore'

export type SentenceStatus = 'idle' | 'loading' | 'done'

export type DirectingStatus = 'draft' | 'done'

export type Directing = {
  status: DirectingStatus
  // 화면에서 이미지를 “연출”하기 위한 간단한 파라미터(추후 ComfyUI/레이어 편집으로 확장)
  scale: number // 0.8 ~ 1.6
  translateX: number // -120 ~ 120 (px)
  translateY: number // -120 ~ 120 (px)
  rotateDeg: number // -8 ~ 8
  brightness: number // 0.75 ~ 1.25
  contrast: number // 0.85 ~ 1.25
  notes: string // 디렉터 메모(프롬프트/연출 의도)
}

export type Sentence = {
  id: string
  text: string
  imageUrl: string | null
  status: SentenceStatus
  isComplete: boolean
  /** 타임라인에서 이 장면을 보여줄 대략적 길이(초). 편집/미리보기용. */
  durationSec: number
  directing: Directing
}

export type PicBookPage = {
  sentenceId: string
  text: string
  imageUrl: string
  directing: Directing
}

export type PicBook = {
  id: string
  title: string
  createdAt: string
  pages: PicBookPage[]
  price: number // MVP: 모의 코인 가격
  purchased: boolean
  // 마스터가 서점에 올릴지 여부(MVP: 로컬 저장소)
  published: boolean
  publishedAt: string | null
}

function normalizePicBook(input: PicBook): PicBook {
  // 과거 저장 데이터 호환: published 필드가 없으면 비공개로 취급
  return {
    ...input,
    published: Boolean(input.published),
    publishedAt: input.publishedAt ?? null,
  }
}

type BookState = {
  fullText: string
  sentences: Sentence[]
  /** 문장 id 순서. 픽북 페이지 순서·캔버스 “모아보기”에 사용. */
  timelineOrder: string[]
  picBooks: PicBook[]
  wallet: { coins: number }
  setFullText: (nextText: string) => void
  /** 외부(제미나이 등)에서 만든 장면 이미지 URL 또는 data URL */
  setSentenceScene: (sentenceId: string, imageUrl: string | null) => void
  setSentenceDuration: (sentenceId: string, durationSec: number) => void
  setTimelineOrder: (orderedSentenceIds: string[]) => void
  moveTimeline: (sentenceId: string, direction: 'up' | 'down') => void
  /** 현재 입력 끝 기준으로 “작성 중인 문장” 인덱스(0~). 문장이 없으면 -1. */
  computeActiveSentenceIndex: () => number
  /** 타임라인 순으로 정렬된 문장 목록(누락 id는 뒤에 붙임). */
  getOrderedSentences: () => Sentence[]
  updateDirecting: (sentenceId: string, patch: Partial<Directing>) => void
  markDirectingDone: (sentenceId: string) => void
  resetDirecting: (sentenceId: string) => void
  regenerateSentenceImage: (sentenceId: string) => { ok: true } | { ok: false; reason: string }
  canAssemblePicBookFromDraft: () => { ok: true } | { ok: false; reason: string }
  assemblePicBookFromDraft: () => { ok: true; picBook: PicBook } | { ok: false; reason: string }
  publishPicBook: (picBookId: string) => { ok: true } | { ok: false; reason: string }
  unpublishPicBook: (picBookId: string) => { ok: true } | { ok: false; reason: string }
  purchasePicBook: (picBookId: string) => { ok: true } | { ok: false; reason: string }
  grantMockCoins: (amount: number) => void
  exportMasterBundleJson: () => string
}

function createId(): string {
  // 브라우저 런타임에서 사용 가능(React 18 + Vite)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeSentenceText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** 에디터·타이핑 연동에서 동일 규칙으로 문장을 나누기 위해 export */
export function splitIntoSentences(text: string): Array<{ text: string; isComplete: boolean }> {
  // 요구사항 기준: ., ?, !, \n 을 문장 경계로 사용
  // - 구두점/줄바꿈을 포함한 덩어리로 먼저 매칭해서 "완성 여부"를 판단한다.
  const chunks = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) ?? []

  const parsed = chunks
    .map((chunk) => {
      const endsWithDelimiter = /[.!?\n]$/.test(chunk)
      const normalized = normalizeSentenceText(chunk)
      return {
        text: normalized,
        isComplete: endsWithDelimiter && normalized.length > 0,
      }
    })
    .filter((x) => x.text.length > 0)

  return parsed
}

function defaultDirecting(): Directing {
  return {
    status: 'draft',
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotateDeg: 0,
    brightness: 1,
    contrast: 1,
    notes: '',
  }
}

function mergeDirecting(prev: Directing, patch: Partial<Directing>): Directing {
  const nextStatus: DirectingStatus = patch.status ?? prev.status
  return {
    status: nextStatus,
    scale: patch.scale ?? prev.scale,
    translateX: patch.translateX ?? prev.translateX,
    translateY: patch.translateY ?? prev.translateY,
    rotateDeg: patch.rotateDeg ?? prev.rotateDeg,
    brightness: patch.brightness ?? prev.brightness,
    contrast: patch.contrast ?? prev.contrast,
    notes: patch.notes ?? prev.notes,
  }
}

function hash32FNV1a(input: string): number {
  // 빠르고 간단한 문자열 해시(결정적). Mock 이미지의 seed로 사용.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function svgDataUrl(sentenceText: string): string {
  const safe = sentenceText.length > 52 ? `${sentenceText.slice(0, 52)}…` : sentenceText
  const seed = hash32FNV1a(sentenceText)
  const rnd = mulberry32(seed)

  const palettes = [
    ['#fdf2f8', '#eef2ff', '#ecfeff', '#111827'],
    ['#fff7ed', '#fef3c7', '#ecfccb', '#1f2937'],
    ['#f0fdf4', '#e0f2fe', '#ede9fe', '#0f172a'],
    ['#eff6ff', '#fae8ff', '#fef9c3', '#111827'],
    ['#f5f3ff', '#e0e7ff', '#cffafe', '#0b1220'],
  ]
  const palette = palettes[seed % palettes.length]

  const bgA = palette[0]
  const bgB = palette[1]
  const bgC = palette[2]
  const ink = palette[3]

  const sunX = Math.floor(160 + rnd() * 960)
  const sunY = Math.floor(110 + rnd() * 220)
  const sunR = Math.floor(42 + rnd() * 64)

  const hillH = Math.floor(120 + rnd() * 160)
  const hillWave = Math.floor(80 + rnd() * 140)
  const hillY = 580 + Math.floor(rnd() * 60)

  const doodles = Array.from({ length: 9 }, () => ({
    x: Math.floor(80 + rnd() * 1120),
    y: Math.floor(80 + rnd() * 520),
    r: Math.floor(10 + rnd() * 28),
    o: clamp(0.05 + rnd() * 0.12, 0.05, 0.18),
  }))

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="832" viewBox="0 0 1280 832">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}"/>
      <stop offset="52%" stop-color="${bgB}"/>
      <stop offset="100%" stop-color="${bgC}"/>
    </linearGradient>
    <filter id="paper" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0.18" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.10" />
      </feComponentTransfer>
    </filter>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.2" />
    </filter>
  </defs>

  <rect width="1280" height="832" fill="url(#g)"/>
  <rect width="1280" height="832" filter="url(#paper)" opacity="0.95"/>

  <!-- 하늘의 점/도형(문장 seed 기반으로 매번 다름) -->
  <g fill="${ink}">
    ${doodles
      .map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" opacity="${d.o}"/>`)
      .join('\n    ')}
  </g>

  <!-- 태양 -->
  <g opacity="0.92">
    <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${ink}" opacity="0.08"/>
    <circle cx="${sunX}" cy="${sunY}" r="${Math.max(18, sunR - 18)}" fill="${ink}" opacity="0.06"/>
  </g>

  <!-- 언덕(간단한 풍경) -->
  <path
    d="M0 ${hillY} C 220 ${hillY - hillH}, 520 ${hillY + hillWave}, 800 ${hillY - hillH + 28} S 1100 ${hillY + hillWave}, 1280 ${hillY - 40} L 1280 832 L 0 832 Z"
    fill="${ink}" opacity="0.06"
  />
  <path
    d="M0 ${hillY + 36} C 260 ${hillY - hillH + 60}, 540 ${hillY + hillWave + 30}, 820 ${hillY - hillH + 68} S 1110 ${hillY + hillWave + 20}, 1280 ${hillY + 10} L 1280 832 L 0 832 Z"
    fill="${ink}" opacity="0.045"
  />

  <!-- 스케치 라인 -->
  <g fill="none" stroke="${ink}" stroke-linecap="round">
    <path d="M120 300 C 320 180, 560 190, 770 305 S 1170 420, 1135 560" stroke-opacity="0.10" stroke-width="10"/>
    <path d="M120 332 C 320 210, 560 220, 770 335 S 1170 455, 1135 592" stroke-opacity="0.08" stroke-width="6"/>
  </g>

  <!-- 캡션 -->
  <g font-family="ui-serif, Georgia, 'Times New Roman', serif" fill="${ink}">
    <text x="72" y="740" font-size="34" opacity="0.62">Picturing Book (Mock • seed ${seed})</text>
    <text x="72" y="790" font-size="44" opacity="0.92">${escapeXml(safe)}</text>
  </g>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

type ImageProvider = 'gemini' | 'mock'

function getImageProvider(): ImageProvider {
  const explicit = import.meta.env.VITE_IMAGE_PROVIDER as string | undefined
  if (explicit === 'mock') return 'mock'
  if (explicit === 'gemini') return 'gemini'

  // 기본 정책: 키가 있으면 Nano Banana(Gemini API) 우선, 없으면 Mock
  return import.meta.env.VITE_GEMINI_API_KEY ? 'gemini' : 'mock'
}

function clipText(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function buildNanoBananaPrompt(input: { fullText: string; sentence: Sentence }): string {
  const story = clipText(input.fullText, 900)
  const notes = input.sentence.directing.notes.trim()

  // 한국어 프롬프트: “그림일기” 톤을 강하게 고정(추후 SceneSpec으로 구조화 예정)
  return [
    '너는 아동/청소년 독서 활동용 “그림일기(픽처링 북)” 일러스트레이터다.',
    '요구사항:',
    '- 단일 장면 1컷으로 완성된 일러스트를 만들어라.',
    '- 과도한 폭력/선정/혐오/실존 인물 초상화는 피해라.',
    '- 글의 핵심 감정과 사건을 시각적으로 명확히 표현해라.',
    '- 화풍: 부드러운 수채화 + 연필 스케치 느낌, 따뜻한 조명, 깔끔한 구도.',
    notes ? `- 디렉터 메모(최우선 반영): ${notes}` : '- 디렉터 메모: 없음',
    '',
    '[원문 문장]',
    input.sentence.text,
    '',
    '[책 전체 맥락(참고용)]',
    story || '(맥락 텍스트 없음)',
  ].join('\n')
}

async function generateSentenceImage(input: { fullText: string; sentence: Sentence }): Promise<string> {
  const provider = getImageProvider()
  const role = useUiStore.getState().role

  // 고객 모드에서는 생성 호출이 들어오면 안 되지만, 방어적으로 Mock로 고정
  if (role !== 'master') {
    const delay = 250 + Math.floor(Math.random() * 250)
    await new Promise((r) => setTimeout(r, delay))
    return svgDataUrl(input.sentence.text)
  }

  if (provider === 'gemini') {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
    if (!apiKey) {
      // 키가 없는데 provider가 gemini로 강제된 경우
      const delay = 250 + Math.floor(Math.random() * 250)
      await new Promise((r) => setTimeout(r, delay))
      return svgDataUrl(input.sentence.text)
    }

    const model =
      (import.meta.env.VITE_GEMINI_IMAGE_MODEL as string | undefined) ?? 'gemini-2.5-flash-image' // Nano Banana (공식 모델명)

    const prompt = buildNanoBananaPrompt({ fullText: input.fullText, sentence: input.sentence })
    try {
      return await generateNanoBananaImageDataUrl({ apiKey, model, prompt })
    } catch {
      // 생성 실패 시에도 작업이 멈추지 않게 Mock로 폴백(마스터는 UI에서 재시도 가능)
      const delay = 250 + Math.floor(Math.random() * 250)
      await new Promise((r) => setTimeout(r, delay))
      return svgDataUrl(input.sentence.text)
    }
  }

  const delay = 650 + Math.floor(Math.random() * 850)
  await new Promise((r) => setTimeout(r, delay))
  return svgDataUrl(input.sentence.text)
}

const STORAGE_KEY = 'picbook.v1'

/** v1 저장 포맷 (마이그레이션용) */
type PersistedV1 = {
  version: 1
  fullText: string
  sentences: Sentence[]
  picBooks: PicBook[]
  wallet: { coins: number }
}

type PersistedV2 = {
  version: 2
  fullText: string
  sentences: Sentence[]
  picBooks: PicBook[]
  wallet: { coins: number }
  timelineOrder: string[]
}

function normalizeSentenceRow(s: Sentence): Sentence {
  return {
    ...s,
    durationSec: typeof s.durationSec === 'number' && s.durationSec > 0 ? s.durationSec : 4,
    directing: s.directing ?? defaultDirecting(),
  }
}

/** 문장 목록이 바뀔 때 이전 순서를 유지하고, 새 문장 id만 뒤에 붙인다. */
function reconcileTimelineOrder(prevOrder: string[], nextSentences: Sentence[]): string[] {
  const ids = nextSentences.map((x) => x.id)
  const idSet = new Set(ids)
  const kept = prevOrder.filter((id) => idSet.has(id))
  const keptSet = new Set(kept)
  for (const id of ids) {
    if (!keptSet.has(id)) kept.push(id)
  }
  return kept
}

function safeParse(json: string | null): PersistedV2 | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PersistedV1 | PersistedV2
    if (!v || (v.version !== 1 && v.version !== 2)) return null
    if (v.version === 1) {
      const sents = (v.sentences ?? []).map(normalizeSentenceRow)
      return {
        version: 2,
        fullText: v.fullText ?? '',
        sentences: sents,
        picBooks: v.picBooks ?? [],
        wallet: v.wallet ?? { coins: 1200 },
        timelineOrder: sents.map((s) => s.id),
      }
    }
    const v2 = v as PersistedV2
    const sents = (v2.sentences ?? []).map(normalizeSentenceRow)
    return {
      version: 2,
      fullText: v2.fullText ?? '',
      sentences: sents,
      picBooks: v2.picBooks ?? [],
      wallet: v2.wallet ?? { coins: 1200 },
      timelineOrder: v2.timelineOrder?.length ? v2.timelineOrder : sents.map((x) => x.id),
    }
  } catch {
    return null
  }
}

function loadPersisted(): PersistedV2 | null {
  if (typeof window === 'undefined') return null
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

function persistSnapshot(state: Pick<BookState, 'fullText' | 'sentences' | 'picBooks' | 'wallet' | 'timelineOrder'>) {
  if (typeof window === 'undefined') return
  const payload: PersistedV2 = {
    version: 2,
    fullText: state.fullText,
    sentences: state.sentences,
    picBooks: state.picBooks,
    wallet: state.wallet,
    timelineOrder: state.timelineOrder,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export const useBookStore = create<BookState>((set, get) => {
  const hydrated = loadPersisted()
  const initialSentences = (hydrated?.sentences ?? []).map(normalizeSentenceRow)
  const initialOrder = reconcileTimelineOrder(hydrated?.timelineOrder ?? [], initialSentences)

  return {
    fullText: hydrated?.fullText ?? '',
    sentences: initialSentences,
    timelineOrder: initialOrder,
    picBooks: (hydrated?.picBooks ?? []).map((b) => normalizePicBook(b)),
    wallet: hydrated?.wallet ?? { coins: 1200 },

    computeActiveSentenceIndex: () => {
      const parsed = splitIntoSentences(get().fullText)
      if (parsed.length === 0) return -1
      return parsed.length - 1
    },

    getOrderedSentences: () => {
      const state = get()
      const byId = Object.fromEntries(state.sentences.map((x) => [x.id, x])) as Record<string, Sentence>
      const base = state.timelineOrder.length > 0 ? state.timelineOrder : state.sentences.map((x) => x.id)
      const seen = new Set<string>()
      const ordered: Sentence[] = []
      for (const id of base) {
        const s = byId[id]
        if (s && !seen.has(id)) {
          seen.add(id)
          ordered.push(s)
        }
      }
      for (const s of state.sentences) {
        if (!seen.has(s.id)) ordered.push(s)
      }
      return ordered
    },

    setSentenceScene: (sentenceId, imageUrl) => {
      set((state) => {
        const nextSentences = state.sentences.map((s) =>
          s.id === sentenceId
            ? {
                ...s,
                imageUrl,
                status: imageUrl ? ('done' as const) : ('idle' as const),
              }
            : s,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })
    },

    setSentenceDuration: (sentenceId, durationSec) => {
      const sec = Math.max(0.5, Math.min(120, durationSec))
      set((state) => {
        const nextSentences = state.sentences.map((s) =>
          s.id === sentenceId ? { ...s, durationSec: sec } : s,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })
    },

    setTimelineOrder: (orderedSentenceIds) => {
      set((state) => {
        const valid = new Set(state.sentences.map((s) => s.id))
        const filtered = orderedSentenceIds.filter((id) => valid.has(id))
        const appended = state.sentences.map((s) => s.id).filter((id) => !filtered.includes(id))
        const timelineOrder = [...filtered, ...appended]
        const out = { ...state, timelineOrder }
        persistSnapshot(out)
        return out
      })
    },

    moveTimeline: (sentenceId, direction) => {
      set((state) => {
        let order = [...state.timelineOrder]
        if (order.length === 0) order = state.sentences.map((s) => s.id)
        const i = order.indexOf(sentenceId)
        if (i === -1) return state
        const j = direction === 'up' ? i - 1 : i + 1
        if (j < 0 || j >= order.length) return state
        const nextOrder = [...order]
        ;[nextOrder[i], nextOrder[j]] = [nextOrder[j], nextOrder[i]]
        const out = { ...state, timelineOrder: nextOrder }
        persistSnapshot(out)
        return out
      })
    },

    grantMockCoins: (amount) => {
      set((state) => {
        const next = { ...state.wallet, coins: state.wallet.coins + amount }
        const out = { ...state, wallet: next }
        persistSnapshot(out)
        return out
      })
    },

    updateDirecting: (sentenceId, patch) => {
      set((state) => {
        const nextSentences = state.sentences.map((s) =>
          s.id === sentenceId ? { ...s, directing: mergeDirecting(s.directing, patch) } : s,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })
    },

    markDirectingDone: (sentenceId) => {
      set((state) => {
        const nextSentences = state.sentences.map((s) =>
          s.id === sentenceId ? { ...s, directing: mergeDirecting(s.directing, { status: 'done' }) } : s,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })
    },

    resetDirecting: (sentenceId) => {
      set((state) => {
        const nextSentences = state.sentences.map((s) =>
          s.id === sentenceId ? { ...s, directing: defaultDirecting() } : s,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })
    },

    regenerateSentenceImage: (sentenceId) => {
      if (useUiStore.getState().role !== 'master') {
        return { ok: false, reason: '마스터 모드에서만 이미지를 재생성할 수 있습니다.' }
      }

      const s = get().sentences.find((x) => x.id === sentenceId)
      if (!s) return { ok: false, reason: '문장을 찾을 수 없습니다.' }
      if (!s.isComplete) return { ok: false, reason: '완성된 문장만 이미지를 생성할 수 있습니다.' }

      set((state) => {
        const nextSentences = state.sentences.map((it) =>
          it.id === sentenceId
            ? {
                ...it,
                status: 'loading' as const,
                // 재생성 중에는 이전 이미지를 숨겨 UX가 명확해지게 한다.
                imageUrl: null,
              }
            : it,
        )
        const out = { ...state, sentences: nextSentences }
        persistSnapshot(out)
        return out
      })

      void (async () => {
        const snap = get().sentences.find((x) => x.id === sentenceId)
        if (!snap) return
        const url = await generateSentenceImage({ fullText: get().fullText, sentence: snap })
        set((state) => {
          const nextSentences = state.sentences.map((it) =>
            it.id === sentenceId ? { ...it, imageUrl: url, status: 'done' as const } : it,
          )
          const out = { ...state, sentences: nextSentences }
          persistSnapshot(out)
          return out
        })
      })()

      return { ok: true }
    },

    canAssemblePicBookFromDraft: () => {
      const { sentences } = get()
      if (sentences.length === 0) return { ok: false, reason: '문장이 없습니다.' }

      const notImageReady = sentences.filter((s) => !(s.status === 'done' && s.imageUrl))
      if (notImageReady.length > 0) {
        return { ok: false, reason: '모든 문장의 이미지가 완료되어야 픽북으로 묶을 수 있습니다.' }
      }

      const notDirected = sentences.filter((s) => s.directing.status !== 'done')
      if (notDirected.length > 0) {
        return { ok: false, reason: '모든 문장의 디렉팅이 완료되어야 픽북으로 묶을 수 있습니다.' }
      }

      return { ok: true }
    },

    assemblePicBookFromDraft: () => {
      const gate = get().canAssemblePicBookFromDraft()
      if (!gate.ok) return gate

      const ordered = get().getOrderedSentences()
      const title = `내 픽북 ${new Date().toLocaleString()}`
      const picBook: PicBook = {
        id: createId(),
        title,
        createdAt: new Date().toISOString(),
        pages: ordered.map((s) => ({
          sentenceId: s.id,
          text: s.text,
          imageUrl: s.imageUrl ?? '',
          directing: s.directing,
        })),
        price: 490,
        purchased: false,
        published: false,
        publishedAt: null,
      }

      set((state) => {
        const out = { ...state, picBooks: [picBook, ...state.picBooks] }
        persistSnapshot(out)
        return out
      })

      return { ok: true, picBook }
    },

    publishPicBook: (picBookId) => {
      const book = get().picBooks.find((b) => b.id === picBookId)
      if (!book) return { ok: false, reason: '픽북을 찾을 수 없습니다.' }
      if (book.published) return { ok: false, reason: '이미 출판된 픽북입니다.' }

      set((state) => {
        const nextBooks = state.picBooks.map((b) =>
          b.id === picBookId
            ? { ...b, published: true, publishedAt: new Date().toISOString() }
            : b,
        )
        const out = { ...state, picBooks: nextBooks }
        persistSnapshot(out)
        return out
      })

      return { ok: true }
    },

    unpublishPicBook: (picBookId) => {
      const book = get().picBooks.find((b) => b.id === picBookId)
      if (!book) return { ok: false, reason: '픽북을 찾을 수 없습니다.' }
      if (!book.published) return { ok: false, reason: '출판되지 않은 픽북입니다.' }

      set((state) => {
        const nextBooks = state.picBooks.map((b) =>
          b.id === picBookId ? { ...b, published: false, publishedAt: null } : b,
        )
        const out = { ...state, picBooks: nextBooks }
        persistSnapshot(out)
        return out
      })

      return { ok: true }
    },

    purchasePicBook: (picBookId) => {
      const { picBooks, wallet } = get()
      const book = picBooks.find((b) => b.id === picBookId)
      if (!book) return { ok: false, reason: '픽북을 찾을 수 없습니다.' }
      if (!book.published) return { ok: false, reason: '서점에 출판되지 않은 픽북은 구매할 수 없습니다.' }
      if (book.purchased) return { ok: false, reason: '이미 구매한 픽북입니다.' }
      if (wallet.coins < book.price) return { ok: false, reason: '코인이 부족합니다. (MVP: 상단의 “코인 충전”을 사용하세요)' }

      set((state) => {
        const nextBooks = state.picBooks.map((b) =>
          b.id === picBookId ? { ...b, purchased: true } : b,
        )
        const nextWallet = { coins: state.wallet.coins - book.price }
        const out = { ...state, picBooks: nextBooks, wallet: nextWallet }
        persistSnapshot(out)
        return out
      })

      return { ok: true }
    },

    exportMasterBundleJson: () => {
      const state = get()
      return JSON.stringify(
        {
          version: 1,
          kind: 'picbook.master_bundle',
          exportedAt: new Date().toISOString(),
          // 마스터 작업물(초안 텍스트/문장/픽북 원본). 서버 업로드/앱 배포 파이프라인의 입력으로 사용.
          fullText: state.fullText,
          sentences: state.sentences,
          timelineOrder: state.timelineOrder,
          picBooks: state.picBooks,
        },
        null,
        2,
      )
    },

    setFullText: (nextText) => {
      set({ fullText: nextText })

      const prev = get().sentences
      const prevOrder = get().timelineOrder
      const parsed = splitIntoSentences(nextText)

      const next: Sentence[] = parsed.map((p, idx) => {
        const prevAt = prev[idx]
        const canReuse = prevAt && prevAt.text === p.text

        if (canReuse) {
          // 같은 위치/같은 문장 텍스트는 장면·디렉팅·id를 유지한다.
          return { ...prevAt, isComplete: p.isComplete }
        }

        const id = createId()
        return {
          id,
          text: p.text,
          imageUrl: null,
          status: 'idle' as const,
          isComplete: p.isComplete,
          durationSec: 4,
          directing: defaultDirecting(),
        }
      })

      const nextOrder = reconcileTimelineOrder(prevOrder, next)

      set((state) => {
        const out = { ...state, sentences: next, timelineOrder: nextOrder }
        persistSnapshot(out)
        return out
      })
    },
  }
})

