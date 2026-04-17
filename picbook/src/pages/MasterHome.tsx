import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useBookStore } from '../store/useBookStore'

export default function MasterHome() {
  const picBooks = useBookStore((s) => s.picBooks)
  const publishPicBook = useBookStore((s) => s.publishPicBook)
  const unpublishPicBook = useBookStore((s) => s.unpublishPicBook)
  const exportMasterBundle = useBookStore((s) => s.exportMasterBundleJson)

  const drafts = useMemo(() => picBooks.filter((b) => !b.published), [picBooks])
  const published = useMemo(() => picBooks.filter((b) => b.published), [picBooks])

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-semibold text-slate-900">마스터 툴킷</h1>
        <p className="mt-1 text-sm text-slate-600">
          여기서 픽북을 만들고(문장/이미지/디렉팅), 완성되면 서점에 올릴 수 있게 <span className="font-semibold">출판</span>합니다.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/editor"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            텍스트 툴킷(에디터)
          </Link>
          <Link
            to="/draft/pages"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            문장 페이지/묶기
          </Link>
          <Link
            to="/store"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            서점 미리보기
          </Link>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            onClick={() => {
              const json = exportMasterBundle()
              const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `picbook-master-bundle-${Date.now()}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            마스터 번들보내기(JSON)
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">출판 대기(비공개)</h2>
            <p className="mt-1 text-xs text-slate-500">아직 서점에 노출되지 않습니다.</p>

            <div className="mt-4 space-y-3">
              {drafts.length === 0 ? (
                <div className="text-sm text-slate-600">출판 대기 픽북이 없습니다.</div>
              ) : (
                drafts.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{b.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          페이지 {b.pages.length} · 가격 {b.price} 코인
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        onClick={() => {
                          const res = publishPicBook(b.id)
                          if (!res.ok) {
                            alert(res.reason)
                            return
                          }
                          alert('서점에 출판되었습니다.')
                        }}
                      >
                        출판
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">출판됨(서점 노출)</h2>
            <p className="mt-1 text-xs text-slate-500">고객 서점(`/store`)에 보입니다.</p>

            <div className="mt-4 space-y-3">
              {published.length === 0 ? (
                <div className="text-sm text-slate-600">출판된 픽북이 없습니다.</div>
              ) : (
                published.map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{b.title}</div>
                        <div className="mt-1 text-xs text-slate-500">출판일: {b.publishedAt ?? '-'}</div>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        onClick={() => {
                          const res = unpublishPicBook(b.id)
                          if (!res.ok) {
                            alert(res.reason)
                            return
                          }
                          alert('서점에서 내렸습니다(비공개).')
                        }}
                      >
                        비공개로 내리기
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
