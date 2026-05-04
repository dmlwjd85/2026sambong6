import { useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadDataUrl, downloadTextFile, safeFileName } from '../lib/downloads'
import { useBookStore } from '../store/useBookStore'

export default function WordSceneEditorPage() {
  const [previewIndex, setPreviewIndex] = useState(0)
  const wordScenes = useBookStore((s) => s.wordScenes)
  const wordSceneOrder = useBookStore((s) => s.wordSceneOrder)
  const moveWordScene = useBookStore((s) => s.moveWordScene)
  const setWordSceneDuration = useBookStore((s) => s.setWordSceneDuration)
  const generateWordSceneImage = useBookStore((s) => s.generateWordSceneImage)
  const exportWordScenesJson = useBookStore((s) => s.exportWordScenesJson)

  const ordered = orderWordScenes(wordScenes, wordSceneOrder)
  const readyScenes = ordered.filter((scene) => scene.imageUrl)
  const current = readyScenes[Math.min(previewIndex, Math.max(readyScenes.length - 1, 0))]
  const totalDuration = ordered.reduce((sum, scene) => sum + scene.durationSec, 0)

  const downloadAll = () => {
    downloadTextFile({
      text: exportWordScenesJson(),
      fileName: `picbook-word-scene-editor-${Date.now()}.json`,
      mimeType: 'application/json;charset=utf-8',
    })
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs text-slate-500">
              <Link to="/editor" className="font-semibold text-violet-700">
                ← 툴킷
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">장면 연결 에디터</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              낱말 단위로 만든 장면을 순서대로 연결하고 표시 시간을 조정합니다. 현재 단계에서는 브라우저 다운로드로
              편집 메타데이터와 이미지를 저장합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={downloadAll}
            >
              편집 JSON 저장
            </button>
            <Link
              to="/editor/scenes"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              문장 타임라인
            </Link>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">연결 미리보기</h2>
                <p className="mt-1 text-xs text-slate-500">
                  총 {ordered.length}장면 · 이미지 준비 {readyScenes.length}장면 · 예상 {totalDuration.toFixed(1)}초
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  disabled={readyScenes.length === 0}
                  onClick={() => setPreviewIndex((idx) => Math.max(0, idx - 1))}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  disabled={readyScenes.length === 0}
                  onClick={() => setPreviewIndex((idx) => Math.min(readyScenes.length - 1, idx + 1))}
                >
                  다음
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 aspect-video">
              {current?.imageUrl ? (
                <img src={current.imageUrl} alt={current.word} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-600">
                  미리볼 수 있는 이미지 장면이 없습니다.
                </div>
              )}
            </div>
            {current ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{current.word}</div>
                  <div className="text-xs text-slate-500">{current.durationSec}초</div>
                </div>
                {current.imageUrl ? (
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    onClick={() => downloadDataUrl(current.imageUrl ?? '', `${safeFileName(current.word)}.png`)}
                  >
                    현재 이미지 저장
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">타임라인 스트립</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {ordered.length === 0 ? (
                <div className="text-sm text-slate-500">툴킷에서 낱말 장면을 먼저 추가하세요.</div>
              ) : (
                ordered.map((scene, idx) => (
                  <button
                    type="button"
                    key={scene.id}
                    className="w-28 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100"
                    onClick={() => setPreviewIndex(Math.max(0, readyScenes.findIndex((x) => x.id === scene.id)))}
                  >
                    <div className="aspect-video overflow-hidden rounded-lg bg-slate-200">
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-500">없음</div>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-semibold text-slate-800">
                      {idx + 1}. {scene.word}
                    </div>
                    <div className="text-[10px] text-slate-500">{scene.durationSec}초</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">장면 순서와 표시 시간</h2>
          {ordered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              낱말 장면이 없습니다. 툴킷에서 낱말을 입력해 주세요.
            </div>
          ) : (
            ordered.map((scene, idx) => (
              <article key={scene.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="h-28 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:w-44">
                    {scene.imageUrl ? (
                      <img src={scene.imageUrl} alt={scene.word} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">장면 없음</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-400">#{idx + 1}</div>
                        <h3 className="text-lg font-semibold text-slate-900">{scene.word}</h3>
                        {scene.prompt ? <p className="mt-1 text-sm text-slate-600">{scene.prompt}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => moveWordScene(scene.id, 'up')}
                        >
                          ↑ 앞으로
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => moveWordScene(scene.id, 'down')}
                        >
                          ↓ 뒤로
                        </button>
                        <button
                          type="button"
                          disabled={scene.status === 'loading'}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-40"
                          onClick={() => {
                            const res = generateWordSceneImage(scene.id)
                            if (!res.ok) alert(res.reason)
                          }}
                        >
                          재생성
                        </button>
                      </div>
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">
                      표시 시간(초)
                      <input
                        type="number"
                        min={0.5}
                        max={120}
                        step={0.5}
                        value={scene.durationSec}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        onChange={(e) => setWordSceneDuration(scene.id, Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function orderWordScenes<T extends { id: string }>(scenes: T[], order: string[]): T[] {
  const byId = Object.fromEntries(scenes.map((scene) => [scene.id, scene])) as Record<string, T>
  const seen = new Set<string>()
  const ordered: T[] = []
  for (const id of order.length > 0 ? order : scenes.map((scene) => scene.id)) {
    const scene = byId[id]
    if (scene && !seen.has(id)) {
      seen.add(id)
      ordered.push(scene)
    }
  }
  for (const scene of scenes) {
    if (!seen.has(scene.id)) ordered.push(scene)
  }
  return ordered
}
