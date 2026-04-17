import { Link, NavLink, Outlet } from 'react-router-dom'
import { useUiStore } from '../store/useUiStore'

export function AppShell() {
  const role = useUiStore((s) => s.role)
  const unlockMasterWithPin = useUiStore((s) => s.unlockMasterWithPin)
  const setRole = useUiStore((s) => s.setRole)

  return (
    <div className="h-full w-full bg-slate-100 flex flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="font-semibold text-slate-900 truncate">
              PicBook
            </Link>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <NavLink
                to="/store"
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-1.5 transition',
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')
                }
              >
                서점
              </NavLink>
              <NavLink
                to="/library"
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-1.5 transition',
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')
                }
              >
                책장
              </NavLink>

              {role === 'master' ? (
                <>
                  <NavLink
                    to="/master"
                    className={({ isActive }) =>
                      [
                        'rounded-lg px-3 py-1.5 transition',
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')
                    }
                  >
                    마스터
                  </NavLink>
                  <NavLink
                    to="/editor"
                    className={({ isActive }) =>
                      [
                        'rounded-lg px-3 py-1.5 transition',
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')
                    }
                  >
                    툴킷
                  </NavLink>
                  <NavLink
                    to="/draft/pages"
                    className={({ isActive }) =>
                      [
                        'rounded-lg px-3 py-1.5 transition',
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')
                    }
                  >
                    문장 페이지
                  </NavLink>
                  <NavLink
                    to="/editor/scenes"
                    className={({ isActive }) =>
                      [
                        'rounded-lg px-3 py-1.5 transition',
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')
                    }
                  >
                    장면·타임라인
                  </NavLink>
                </>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
              모드: <span className="font-semibold text-slate-700">{role === 'master' ? '마스터' : '고객'}</span>
            </span>

            {role === 'master' ? (
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  const ok = window.confirm('고객 모드로 전환할까요? (브라우저에 저장됩니다)')
                  if (!ok) return
                  setRole('customer')
                }}
              >
                고객 모드
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={() => {
                  const pin = window.prompt('마스터 PIN을 입력하세요.') ?? ''
                  const res = unlockMasterWithPin(pin.trim())
                  if (!res.ok) {
                    alert(res.reason)
                    return
                  }
                  alert('마스터 모드로 전환되었습니다.')
                }}
              >
                마스터 모드
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
