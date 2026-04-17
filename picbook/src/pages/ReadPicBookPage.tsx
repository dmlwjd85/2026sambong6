import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
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

export default function ReadPicBookPage() {
  const { picBookId } = useParams()
  const book = useBookStore((s) => s.picBooks.find((b) => b.id === picBookId))

  if (!picBookId) {
    return <div className="p-6 text-sm text-slate-600">픽북 ID가 없습니다.</div>
  }

  if (!book) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">픽북을 찾을 수 없습니다.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700" to="/library">
          책장으로 돌아가기
        </Link>
      </div>
    )
  }

  if (!book.purchased) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">이 픽북은 구매 후 열람할 수 있습니다.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700" to="/library">
          책장으로 이동
        </Link>
      </div>
    )
  }

  if (!book.published) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">이 픽북은 서점에서 내려진(비공개) 상태입니다.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-violet-700" to="/store">
          서점으로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="text-xs text-slate-500">
          <Link to="/library" className="font-semibold text-violet-700">
            ← 책장
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{book.title}</h1>
        <p className="mt-1 text-sm text-slate-600">총 {book.pages.length}페이지</p>

        <div className="mt-6 flex flex-col gap-6">
          {book.pages.map((p, idx) => (
            <section key={`${book.id}-${p.sentenceId}`} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="relative aspect-[16/10] bg-slate-50">
                <img
                  src={p.imageUrl}
                  alt={p.text}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={directingImageStyle(p.directing)}
                />
                <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold border border-slate-200">
                  {idx + 1}
                </div>
              </div>
              <div className="p-4 border-t border-slate-200">
                <p className="text-sm text-slate-900 leading-relaxed" style={{ fontFamily: 'var(--pb-font)' }}>
                  {p.text}
                </p>
                {p.directing.notes.trim().length > 0 ? (
                  <p className="mt-3 text-xs text-slate-600 whitespace-pre-wrap border-t border-slate-200 pt-3">
                    <span className="font-semibold text-slate-800">메모</span>
                    <br />
                    {p.directing.notes}
                  </p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
