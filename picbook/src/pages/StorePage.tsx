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

export default function StorePage() {
  const picBooks = useBookStore((s) => s.picBooks)
  const wallet = useBookStore((s) => s.wallet)
  const purchasePicBook = useBookStore((s) => s.purchasePicBook)
  const grantMockCoins = useBookStore((s) => s.grantMockCoins)

  const listings = useMemo(() => picBooks.filter((b) => b.published), [picBooks])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">픽북 서점</h1>
            <p className="mt-1 text-sm text-slate-600">
              마스터가 <span className="font-semibold">출판(publish)</span>한 픽북만 진열됩니다. 구매 후에는 책장에서 열람할 수 있어요.
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
              <Link
                to="/library"
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                내 책장
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {listings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              아직 서점에 올라온 픽북이 없습니다. 마스터 툴킷에서 픽북을 만들고{' '}
              <span className="font-semibold">출판</span>해 주세요.
            </div>
          ) : (
            listings.map((b) => {
              const cover = b.pages[0]
              const lockedPreview = !b.purchased
              return (
                <article key={b.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="relative aspect-[16/10] bg-slate-50">
                    {cover ? (
                      <>
                        <img
                          src={cover.imageUrl}
                          alt={b.title}
                          className={[
                            'absolute inset-0 h-full w-full object-cover',
                            lockedPreview ? 'blur-md scale-105' : '',
                          ].join(' ')}
                          style={directingImageStyle(cover.directing)}
                        />
                        {lockedPreview ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="rounded-2xl bg-white/90 px-4 py-3 border border-slate-200 shadow-sm text-sm font-semibold text-slate-900">
                              구매 전 미리보기
                            </div>
                          </div>
                        ) : null}
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
                          페이지 {b.pages.length} · 가격{' '}
                          <span className="font-semibold tabular-nums">{b.price}</span> 코인
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={[
                            'text-[11px] rounded-full px-2 py-1 border',
                            b.purchased
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200',
                          ].join(' ')}
                        >
                          {b.purchased ? '보유' : '미보유'}
                        </span>

                        {b.purchased ? (
                          <Link
                            to={`/read/${b.id}`}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            열람
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700"
                            onClick={() => {
                              const res = purchasePicBook(b.id)
                              if (!res.ok) {
                                alert(res.reason)
                                return
                              }
                              alert('구매가 완료되었습니다. 책장에서 열람할 수 있어요.')
                            }}
                          >
                            구매하기
                          </button>
                        )}
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
