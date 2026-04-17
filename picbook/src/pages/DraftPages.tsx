import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useBookStore } from '../store/useBookStore'

export default function DraftPages() {
  const sentences = useBookStore((s) => s.sentences)
  const assemblePicBookFromDraft = useBookStore((s) => s.assemblePicBookFromDraft)
  const canAssemble = useBookStore((s) => s.canAssemblePicBookFromDraft())

  const stats = useMemo(() => {
    const imageReady = sentences.filter((x) => x.status === 'done' && x.imageUrl).length
    const directed = sentences.filter((x) => x.directing.status === 'done').length
    return { imageReady, directed, total: sentences.length }
  }, [sentences])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">문장별 완성 페이지</h1>
            <p className="mt-1 text-sm text-slate-600">
              이미지가 완료된 문장은 페이지로 조회할 수 있고, 각 페이지에서 디렉팅(구도/톤)을 저장할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="text-xs text-slate-500">
              이미지 완료 <span className="font-medium text-slate-800">{stats.imageReady}</span> / 디렉팅 완료{' '}
              <span className="font-medium text-slate-800">{stats.directed}</span> / 총{' '}
              <span className="font-medium text-slate-800">{stats.total}</span>
            </div>
            <button
              type="button"
              disabled={!canAssemble.ok}
              onClick={() => {
                const res = assemblePicBookFromDraft()
                if (!res.ok) {
                  alert(res.reason)
                  return
                }
                alert(
                  `픽북이 생성되었습니다: ${res.picBook.title}\n다음으로 마스터 화면에서 서점에 올리려면 "출판"을 진행해 주세요.`,
                )
              }}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold border transition',
                canAssemble.ok
                  ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed',
              ].join(' ')}
            >
              픽북으로 묶기
            </button>
            {!canAssemble.ok ? (
              <div className="text-xs text-slate-500 max-w-[520px] text-right">{canAssemble.reason}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sentences.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              아직 문장이 없습니다. 에디터에서 텍스트를 입력해 주세요.
            </div>
          ) : (
            sentences.map((s, idx) => {
              const ready = s.status === 'done' && Boolean(s.imageUrl)
              return (
                <div key={s.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="relative aspect-[16/10] bg-slate-50">
                    {ready ? (
                      <img src={s.imageUrl ?? ''} alt={s.text} className="h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
                        이미지 생성 중이거나 문장이 아직 완성되지 않았습니다.
                      </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold border border-slate-200">
                      {idx + 1}페이지
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-200">
                    <p className="text-sm text-slate-900 leading-relaxed" style={{ fontFamily: 'var(--pb-font)' }}>
                      {s.text}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'text-[11px] rounded-full px-2 py-1 border',
                          s.status === 'done'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : s.status === 'loading'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200',
                        ].join(' ')}
                      >
                        이미지: {s.status === 'done' ? '완료' : s.status === 'loading' ? '생성중' : '대기'}
                      </span>

                      <span
                        className={[
                          'text-[11px] rounded-full px-2 py-1 border',
                          s.directing.status === 'done'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200',
                        ].join(' ')}
                      >
                        디렉팅: {s.directing.status === 'done' ? '완료' : '진행중'}
                      </span>

                      <Link
                        to={`/direct/${s.id}`}
                        className={[
                          'ml-auto inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold border transition',
                          ready
                            ? 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                            : 'pointer-events-none opacity-40',
                        ].join(' ')}
                      >
                        디렉팅 열기
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
