import type { ChangeEvent, CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useBookStore } from '../store/useBookStore'
import type { Directing } from '../store/useBookStore'
import { useUiStore } from '../store/useUiStore'

function directingImageStyle(input: {
  scale: number
  translateX: number
  translateY: number
  rotateDeg: number
  brightness: number
  contrast: number
}): CSSProperties {
  const { scale, translateX, translateY, rotateDeg, brightness, contrast } = input
  return {
    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotateDeg}deg) scale(${scale})`,
    filter: `brightness(${brightness}) contrast(${contrast})`,
    transformOrigin: '50% 50%',
    willChange: 'transform, filter',
  }
}

export default function DirectingPage() {
  const { sentenceId } = useParams()
  const navigate = useNavigate()

  const sentence = useBookStore((s) => s.sentences.find((x) => x.id === sentenceId))
  const updateDirecting = useBookStore((s) => s.updateDirecting)
  const markDirectingDone = useBookStore((s) => s.markDirectingDone)
  const resetDirecting = useBookStore((s) => s.resetDirecting)
  const regenerateSentenceImage = useBookStore((s) => s.regenerateSentenceImage)
  const role = useUiStore((s) => s.role)

  const ready = Boolean(sentence && sentence.status === 'done' && sentence.imageUrl)
  const generating = Boolean(sentence && sentence.status === 'loading' && sentence.isComplete)

  const d = sentence?.directing

  const previewStyle = useMemo(() => {
    if (!d) return undefined
    return directingImageStyle(d)
  }, [d])

  if (!sentenceId) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">문장 ID가 없습니다.</p>
      </div>
    )
  }

  if (!sentence) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">해당 문장을 찾을 수 없습니다.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700" to="/draft/pages">
          문장 페이지로 돌아가기
        </Link>
      </div>
    )
  }

  const onNumber =
    (key: keyof Pick<Directing, 'scale' | 'translateX' | 'translateY' | 'rotateDeg' | 'brightness' | 'contrast'>) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value)
      if (key === 'scale') updateDirecting(sentence.id, { scale: n })
      if (key === 'translateX') updateDirecting(sentence.id, { translateX: n })
      if (key === 'translateY') updateDirecting(sentence.id, { translateY: n })
      if (key === 'rotateDeg') updateDirecting(sentence.id, { rotateDeg: n })
      if (key === 'brightness') updateDirecting(sentence.id, { brightness: n })
      if (key === 'contrast') updateDirecting(sentence.id, { contrast: n })
    }

  const onNotes = (e: ChangeEvent<HTMLTextAreaElement>) => {
    updateDirecting(sentence.id, { notes: e.target.value })
  }

  const geminiKeyConfigured = Boolean(import.meta.env.VITE_GEMINI_API_KEY)
  const imageModel = (import.meta.env.VITE_GEMINI_IMAGE_MODEL as string | undefined) ?? 'gemini-2.5-flash-image'
  const imageProvider = (import.meta.env.VITE_IMAGE_PROVIDER as string | undefined) ?? (geminiKeyConfigured ? 'gemini' : 'mock')

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-500">
              <Link to="/draft/pages" className="font-semibold text-violet-700">
                ← 문장 페이지
              </Link>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">디렉팅</h1>
            <p className="mt-1 text-sm text-slate-600">
              MVP 단계에서는 화면 연출(크롭/톤) 파라미터를 저장합니다. 이후 ComfyUI/레이어 편집으로 확장할 수 있어요.
            </p>
            {role === 'master' ? (
              <p className="mt-2 text-xs text-slate-500">
                이미지 엔진: <span className="font-semibold text-slate-700">{imageProvider}</span>
                {imageProvider === 'gemini' ? (
                  <>
                    {' '}
                    · 모델: <span className="font-mono">{imageModel}</span>
                    {!geminiKeyConfigured ? (
                      <span className="text-amber-700"> · VITE_GEMINI_API_KEY가 없어 실제 호출이 불가능할 수 있습니다.</span>
                    ) : null}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => resetDirecting(sentence.id)}
            >
              초기화
            </button>
            <button
              type="button"
              disabled={role !== 'master' || !sentence.isComplete || sentence.status === 'loading'}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold border transition',
                role === 'master' && sentence.isComplete && sentence.status !== 'loading'
                  ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed',
              ].join(' ')}
              onClick={() => {
                const res = regenerateSentenceImage(sentence.id)
                if (!res.ok) {
                  alert(res.reason)
                }
              }}
              title="디렉터 메모/문장을 반영해 Nano Banana(Gemini 이미지)로 장면을 다시 만듭니다."
            >
              Nano Banana로 장면 재생성
            </button>
            <button
              type="button"
              disabled={!ready}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold border transition',
                ready
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed',
              ].join(' ')}
              onClick={() => {
                markDirectingDone(sentence.id)
                navigate('/draft/pages')
              }}
            >
              디렉팅 완료
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">프리뷰</h2>
              <span
                className={[
                  'text-[11px] rounded-full px-2 py-1 border',
                  sentence.directing.status === 'done'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200',
                ].join(' ')}
              >
                {sentence.directing.status === 'done' ? '완료' : '진행중'}
              </span>
            </div>

            <div className="mt-4 relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 aspect-[16/10]">
              {generating ? (
                <div className="absolute inset-0">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/85 px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-800">
                      Nano Banana 생성 중…
                    </div>
                  </div>
                </div>
              ) : !ready ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
                  이미지가 아직 준비되지 않았습니다.
                </div>
              ) : (
                <img
                  src={sentence.imageUrl ?? ''}
                  alt={sentence.text}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={previewStyle}
                />
              )}
            </div>

            <p className="mt-4 text-sm text-slate-900 leading-relaxed" style={{ fontFamily: 'var(--pb-font)' }}>
              {sentence.text}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">연출 컨트롤</h2>
            <p className="mt-1 text-xs text-slate-500">
              슬라이더 값은 문장에 저장됩니다. (다른 사용자에게 배포하려면 추후 서버 동기화가 필요합니다.)
            </p>

            <div className="mt-5 space-y-4">
              <SliderRow
                label="확대/축소"
                min={0.85}
                max={1.35}
                step={0.01}
                value={sentence.directing.scale}
                onChange={onNumber('scale')}
              />
              <SliderRow
                label="좌우 이동"
                min={-120}
                max={120}
                step={1}
                value={sentence.directing.translateX}
                onChange={onNumber('translateX')}
              />
              <SliderRow
                label="상하 이동"
                min={-120}
                max={120}
                step={1}
                value={sentence.directing.translateY}
                onChange={onNumber('translateY')}
              />
              <SliderRow
                label="기울기"
                min={-8}
                max={8}
                step={0.25}
                value={sentence.directing.rotateDeg}
                onChange={onNumber('rotateDeg')}
              />
              <SliderRow
                label="밝기"
                min={0.75}
                max={1.25}
                step={0.01}
                value={sentence.directing.brightness}
                onChange={onNumber('brightness')}
              />
              <SliderRow
                label="대비"
                min={0.85}
                max={1.25}
                step={0.01}
                value={sentence.directing.contrast}
                onChange={onNumber('contrast')}
              />
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-700">디렉터 메모</label>
              <textarea
                value={sentence.directing.notes}
                onChange={onNotes}
                rows={6}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
                placeholder="예: 따뜻한 조명, 인물은 오른쪽, 배경은 흐리게…"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function SliderRow(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  const { label, min, max, step, value, onChange } = props
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-700">{label}</div>
        <div className="text-xs tabular-nums text-slate-500">{value}</div>
      </div>
      <input
        className="mt-2 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}
