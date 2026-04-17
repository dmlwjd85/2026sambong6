import { useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useBookStore } from '../store/useBookStore'

/**
 * 문장별로 외부(제미나이 등)에서 만든 장면을 붙이고, 타임라인 순서·표시 시간을 편집한다.
 */
export default function SceneTimelinePage() {
  const sentences = useBookStore((s) => s.sentences)
  const timelineOrder = useBookStore((s) => s.timelineOrder)
  const ordered = useMemo(() => useBookStore.getState().getOrderedSentences(), [sentences, timelineOrder])
  const setSentenceScene = useBookStore((s) => s.setSentenceScene)
  const setSentenceDuration = useBookStore((s) => s.setSentenceDuration)
  const moveTimeline = useBookStore((s) => s.moveTimeline)
  const setTimelineOrder = useBookStore((s) => s.setTimelineOrder)

  const fileRef = useRef<Record<string, HTMLInputElement | null>>({})

  const onPickFile = useCallback(
    (sentenceId: string, file: File | null) => {
      if (!file || !file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const url = typeof reader.result === 'string' ? reader.result : null
        setSentenceScene(sentenceId, url)
      }
      reader.readAsDataURL(file)
    },
    [setSentenceScene],
  )

  const onDropOnThumb = useCallback(
    (sentenceId: string, e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files?.[0]
      if (f) onPickFile(sentenceId, f)
    },
    [onPickFile],
  )

  const timelineStrip = ordered.map((s) => ({
    id: s.id,
    text: s.text,
    imageUrl: s.imageUrl,
    durationSec: s.durationSec,
  }))

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">장면 · 타임라인</h1>
          <p className="mt-2 text-sm text-slate-600 max-w-xl">
            전체 텍스트로 나뉜 문장마다 이미지 URL을 붙이거나 파일을 선택하세요. 아래 줄에서 순서를 바꾸면
            픽북 페이지 순서와 캔버스 “모아보기”에 반영됩니다.
          </p>
        </div>
        <Link
          to="/editor"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 shrink-0"
        >
          ← 툴킷으로
        </Link>
      </header>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">타임라인 (드래그 대신 ↑↓)</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {timelineStrip.length === 0 ? (
            <p className="text-sm text-slate-500">문장이 없습니다. 툴킷에서 본문을 입력하세요.</p>
          ) : (
            timelineStrip.map((item, idx) => (
              <div
                key={item.id}
                className="flex w-[120px] shrink-0 flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2"
                title={item.text}
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-200">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-slate-500 px-1 text-center">
                      장면 없음
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{idx + 1}번</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">문장별 장면</h2>
        {sentences.length === 0 ? (
          <p className="text-sm text-slate-500">본문이 비어 있습니다.</p>
        ) : (
          <ul className="space-y-4">
            {sentences.map((s, idx) => (
              <li
                key={s.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropOnThumb(s.id, e)}
              >
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="relative w-full max-w-[280px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 aspect-[16/10]">
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-500">
                        이미지 없음
                        <span className="text-xs text-slate-400">여기에 파일을 끌어 놓을 수 있습니다</span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[15px] leading-relaxed text-slate-900" style={{ fontFamily: 'var(--pb-font)' }}>
                        <span className="mr-2 text-xs font-semibold text-slate-400">#{idx + 1}</span>
                        {s.text}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => moveTimeline(s.id, 'up')}
                        >
                          ↑ 앞으로
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => moveTimeline(s.id, 'down')}
                        >
                          ↓ 뒤로
                        </button>
                        <Link
                          to={`/direct/${s.id}`}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                        >
                          디렉팅
                        </Link>
                      </div>
                    </div>

                    <label className="block text-xs font-medium text-slate-600">
                      이미지 URL (data URL 가능)
                      <input
                        key={`${s.id}-${s.imageUrl?.startsWith('data:') ? 'data' : s.imageUrl ?? 'none'}`}
                        type="url"
                        defaultValue={s.imageUrl?.startsWith('data:') ? '' : s.imageUrl ?? ''}
                        placeholder="https://..."
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          // 비우기만으로는 로컬(data URL) 장면을 지우지 않음 — 「장면 제거」 사용
                          if (v.length > 0) setSentenceScene(s.id, v)
                        }}
                      />
                    </label>
                    {s.imageUrl?.startsWith('data:') ? (
                      <p className="text-xs text-slate-500">현재 로컬(data URL) 이미지가 붙어 있습니다. URL 입력으로 바꿀 수 있습니다.</p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs font-medium text-slate-600">
                        파일에서 불러오기
                        <input
                          ref={(el) => {
                            fileRef.current[s.id] = el
                          }}
                          type="file"
                          accept="image/*"
                          className="mt-1 block text-sm"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null
                            onPickFile(s.id, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {s.imageUrl ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-600 hover:underline"
                          onClick={() => setSentenceScene(s.id, null)}
                        >
                          장면 제거
                        </button>
                      ) : null}
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      표시 시간(초)
                      <input
                        type="number"
                        min={0.5}
                        max={120}
                        step={0.5}
                        value={s.durationSec}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        onChange={(e) => setSentenceDuration(s.id, Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 text-xs text-slate-500">
        타임라인 순서를 한 번에 바꾸려면 아래처럼 id 순서를 붙여 넣을 수 있습니다(고급).
        <details className="mt-2">
          <summary className="cursor-pointer text-slate-600">고급: 순서 id 붙여넣기</summary>
          <textarea
            className="mt-2 w-full rounded-lg border border-slate-200 p-2 font-mono text-[11px]"
            rows={3}
            placeholder={ordered.map((x) => x.id).join(', ')}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              if (!raw) return
              const ids = raw
                .split(/[\s,]+/)
                .map((x) => x.trim())
                .filter(Boolean)
              setTimelineOrder(ids)
            }}
          />
        </details>
      </footer>
    </div>
  )
}
