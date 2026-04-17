import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBookStore } from '../store/useBookStore'
import type { Sentence } from '../store/useBookStore'

function Spinner() {
  return (
    <div
      className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin"
      aria-label="로딩 중"
    />
  )
}

function SentenceCard({ s }: { s: Sentence }) {
  const ready = s.status === 'done' && Boolean(s.imageUrl)
  const loading = s.status === 'loading'
  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="relative aspect-[16/10] bg-slate-50">
        {loading ? (
          <>
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 border border-slate-200 shadow-sm backdrop-blur">
                <Spinner />
                <span className="text-sm text-slate-700">이미지 재생성 중…</span>
              </div>
            </div>
          </>
        ) : ready ? (
          <img
            src={s.imageUrl ?? ''}
            alt={s.text}
            className="absolute inset-0 h-full w-full object-cover opacity-0 animate-fade"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100/90 p-6 text-center">
            <p className="text-sm text-slate-600">아직 붙인 장면이 없습니다</p>
            <Link
              to="/editor/scenes"
              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              장면·타임라인에서 이미지 넣기
            </Link>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <p
            className="text-[15px] leading-relaxed text-slate-900"
            style={{ fontFamily: 'var(--pb-font)' }}
          >
            {s.text}
          </p>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className={[
                'text-[11px] rounded-full px-2 py-1 border',
                ready
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : loading
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200',
              ].join(' ')}
            >
              {ready ? '장면 있음' : loading ? '생성중' : '장면 없음'}
            </span>

            <Link
              to={`/direct/${s.id}`}
              className={[
                'rounded-xl px-3 py-2 text-[11px] font-semibold border transition',
                ready ? 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50' : 'pointer-events-none opacity-40',
              ].join(' ')}
            >
              디렉팅
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

type ViewMode = 'typing' | 'all' | 'grid'

export function Canvas() {
  const sentences = useBookStore((s) => s.sentences)
  const timelineOrder = useBookStore((s) => s.timelineOrder)
  const computeActiveSentenceIndex = useBookStore((s) => s.computeActiveSentenceIndex)
  const [viewMode, setViewMode] = useState<ViewMode>('typing')

  const ordered = useMemo(() => useBookStore.getState().getOrderedSentences(), [sentences, timelineOrder])

  const activeIdx = computeActiveSentenceIndex()
  const activeSentence = activeIdx >= 0 ? sentences[activeIdx] ?? null : null

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const hasAny = sentences.length > 0

  const signature = useMemo(() => {
    const last = sentences.at(-1)
    if (!last) return 'none'
    return `${sentences.length}:${last.id}:${last.status}:${last.text.length}`
  }, [sentences])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [signature])

  return (
    <section className="h-full bg-gradient-to-b from-slate-50 to-white">
      <header className="px-5 py-4 border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">그림일기 캔버스</h2>
            <p className="text-xs text-slate-500 mt-1">
              {viewMode === 'typing' && '입력 끝에 해당하는 문장의 장면을 크게 보여 줍니다.'}
              {viewMode === 'all' && '문장 순서(입력 순)대로 카드가 쌓입니다.'}
              {viewMode === 'grid' && '타임라인 순서로 장면을 한눈에 봅니다.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['typing', 'all', 'grid'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={[
                  'rounded-xl px-3 py-1.5 text-xs font-semibold border transition',
                  viewMode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                ].join(' ')}
              >
                {m === 'typing' ? '타이핑 연동' : m === 'all' ? '전체 스크롤' : '타임라인 격자'}
              </button>
            ))}
            <Link
              to="/editor/scenes"
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
            >
              장면 편집
            </Link>
          </div>
        </div>
      </header>

      <div ref={wrapRef} className="h-[calc(100%-57px)] overflow-auto px-5 py-5">
        {!hasAny ? (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center font-semibold">
                PB
              </div>
              <p className="mt-4 text-slate-700 font-medium">오른쪽에 그림일기가 나타납니다</p>
              <p className="mt-2 text-sm text-slate-500">
                왼쪽에서 문장을 입력하고 <span className="font-medium">마침표/물음표/느낌표/줄바꿈</span>으로
                문장을 끝낸 뒤, 장면·타임라인에서 이미지를 붙여 주세요.
              </p>
            </div>
          </div>
        ) : viewMode === 'typing' ? (
          <div className="mx-auto max-w-[860px] flex flex-col gap-5">
            {activeSentence ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-xs text-slate-500 mb-2">현재 입력 중인 문장</p>
                  <SentenceCard s={activeSentence} />
                </div>
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">타임라인 순 미리보기 (클릭은 편집 페이지에서)</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {ordered.map((s) => {
                      const isActive = s.id === activeSentence.id
                      return (
                        <div
                          key={s.id}
                          className={[
                            'w-[100px] shrink-0 rounded-xl border overflow-hidden',
                            isActive ? 'ring-2 ring-violet-500 border-violet-300' : 'border-slate-200',
                          ].join(' ')}
                        >
                          <div className="aspect-video bg-slate-100">
                            {s.imageUrl ? (
                              <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-slate-400 p-1 text-center">
                                없음
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">활성 문장을 찾을 수 없습니다.</p>
            )}
            <div ref={endRef} />
          </div>
        ) : viewMode === 'all' ? (
          <div className="mx-auto max-w-[860px] flex flex-col gap-5">
            {sentences.map((s) => (
              <SentenceCard key={s.id} s={s} />
            ))}
            <div ref={endRef} />
          </div>
        ) : (
          <div className="mx-auto max-w-[960px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ordered.map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="aspect-video bg-slate-100">
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400 p-2 text-center">
                        장면 없음
                      </div>
                    )}
                  </div>
                  <p className="p-2 text-[11px] leading-snug text-slate-700 line-clamp-3" style={{ fontFamily: 'var(--pb-font)' }}>
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
            <div ref={endRef} />
          </div>
        )}
      </div>
    </section>
  )
}
