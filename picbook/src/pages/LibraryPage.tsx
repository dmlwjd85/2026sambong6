import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useBookStore } from '../store/useBookStore'

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

export default function LibraryPage() {
  const picBooks = useBookStore((s) => s.picBooks)
  const wallet = useBookStore((s) => s.wallet)
  const grantMockCoins = useBookStore((s) => s.grantMockCoins)

  const owned = useMemo(() => picBooks.filter((b) => b.purchased), [picBooks])

  const exportPayload = useMemo(() => {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        wallet,
        // 고객 책장은 “구매한 픽북”만 의미가 있습니다.
        picBooks: owned,
      },
      null,
      2,
    )
  }, [owned, wallet])

  const downloadJson = () => {
    const blob = new Blob([exportPayload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `picbook-library-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">책장</h1>
            <p className="mt-1 text-sm text-slate-600">
              구매한 픽북만 표시합니다. 새 픽북은 <span className="font-semibold">서점</span>에서 구매해 주세요.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="text-sm text-slate-700">
              보유 코인: <span className="font-semibold tabular-nums">{wallet.coins}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => grantMockCoins(500)}
              >
                코인 +500 (모의)
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={downloadJson}
              >
                책장보내기(JSON)
              </button>
              <Link
                to="/store"
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                서점 가기
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {owned.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              아직 구매한 픽북이 없습니다. <span className="font-semibold">서점</span>에서 픽북을 구매해 주세요.
            </div>
          ) : (
            owned.map((b) => {
              const cover = b.pages[0]
              return (
                <article key={b.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="relative aspect-[16/10] bg-slate-50">
                    {cover ? (
                      <>
                        <img
                          src={cover.imageUrl}
                          alt={b.title}
                          className="absolute inset-0 h-full w-full object-cover"
                          style={directingImageStyle(cover.directing)}
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
                        표지 이미지가 없습니다.
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-900 truncate">{b.title}</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          페이지 {b.pages.length} · 가격 <span className="font-semibold tabular-nums">{b.price}</span> 코인
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[11px] rounded-full px-2 py-1 border bg-emerald-50 text-emerald-700 border-emerald-200">
                          보유
                        </span>

                        <Link
                          to={`/read/${b.id}`}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          열람
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
