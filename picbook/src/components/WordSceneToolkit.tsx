import { useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadDataUrl, downloadTextFile, safeFileName } from '../lib/downloads'
import { useBookStore } from '../store/useBookStore'

export function WordSceneToolkit() {
  const [input, setInput] = useState('')
  const wordScenes = useBookStore((s) => s.wordScenes)
  const wordSceneOrder = useBookStore((s) => s.wordSceneOrder)
  const addWordScenesFromInput = useBookStore((s) => s.addWordScenesFromInput)
  const generateWordSceneImage = useBookStore((s) => s.generateWordSceneImage)
  const removeWordScene = useBookStore((s) => s.removeWordScene)
  const updateWordScenePrompt = useBookStore((s) => s.updateWordScenePrompt)
  const exportWordScenesJson = useBookStore((s) => s.exportWordScenesJson)

  const ordered = orderWordScenes(wordScenes, wordSceneOrder)
  const doneCount = wordScenes.filter((scene) => scene.status === 'done' && scene.imageUrl).length
  const loadingCount = wordScenes.filter((scene) => scene.status === 'loading').length

  const addScenes = () => {
    const res = addWordScenesFromInput(input)
    if (!res.ok) {
      alert(res.reason)
      return
    }
    setInput('')
  }

  const downloadBundle = () => {
    downloadTextFile({
      text: exportWordScenesJson(),
      fileName: `picbook-word-scenes-${Date.now()}.json`,
      mimeType: 'application/json;charset=utf-8',
    })
  }

  return (
    <section className="h-full min-h-0 overflow-auto border-t border-slate-200 bg-slate-50/80 lg:border-l lg:border-t-0">
      <div className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">낱말 장면 생성</h2>
            <p className="mt-1 text-sm text-slate-600">
              낱말을 공백이나 줄바꿈으로 입력하면 장면 후보를 만들고 Nano Banana로 이미지를 생성합니다.
            </p>
          </div>
          <Link
            to="/editor/word-scenes"
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            장면 연결 에디터
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold text-slate-700">
            낱말 입력
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="예시) 바다 고양이 달빛 우산"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              완료 <span className="font-semibold text-slate-800">{doneCount}</span> / 생성중{' '}
              <span className="font-semibold text-slate-800">{loadingCount}</span> / 전체{' '}
              <span className="font-semibold text-slate-800">{wordScenes.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={addScenes}
              >
                낱말 추가
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={downloadBundle}
              >
                JSON 저장
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {ordered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              아직 낱말 장면이 없습니다. 위 입력칸에 낱말을 넣어 주세요.
            </div>
          ) : (
            ordered.map((scene) => (
              <article key={scene.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    {scene.imageUrl ? (
                      <img src={scene.imageUrl} alt={scene.word} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">
                        {scene.status === 'loading' ? '생성 중…' : '장면 없음'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{scene.word}</div>
                        <div className="text-[11px] text-slate-500">상태: {statusLabel(scene.status)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={scene.status === 'loading'}
                          className="rounded-lg bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                          onClick={() => {
                            const res = generateWordSceneImage(scene.id)
                            if (!res.ok) alert(res.reason)
                          }}
                        >
                          Nano 생성
                        </button>
                        {scene.imageUrl ? (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => downloadDataUrl(scene.imageUrl ?? '', `${safeFileName(scene.word)}.png`)}
                          >
                            이미지 저장
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          onClick={() => removeWordScene(scene.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <label className="block text-xs font-medium text-slate-600">
                      추가 지시
                      <input
                        value={scene.prompt}
                        onChange={(e) => updateWordScenePrompt(scene.id, e.target.value)}
                        placeholder="예: 비 오는 골목, 따뜻한 조명"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    {scene.error ? <div className="text-xs text-rose-600">{scene.error}</div> : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function statusLabel(status: string): string {
  if (status === 'done') return '완료'
  if (status === 'loading') return '생성중'
  if (status === 'error') return '오류'
  return '대기'
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
