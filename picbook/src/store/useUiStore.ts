import { create } from 'zustand'

const ROLE_KEY = 'picbook.role'

export type AppRole = 'customer' | 'master'

function readRoleFromStorage(): AppRole {
  if (typeof window === 'undefined') return 'customer'
  const v = window.localStorage.getItem(ROLE_KEY)
  return v === 'master' ? 'master' : 'customer'
}

type UiState = {
  role: AppRole
  setRole: (role: AppRole) => void
  unlockMasterWithPin: (pin: string) => { ok: true } | { ok: false; reason: string }
}

export const useUiStore = create<UiState>((set) => ({
  role: readRoleFromStorage(),
  setRole: (role) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_KEY, role)
    }
    set({ role })
  },
  unlockMasterWithPin: (pin) => {
    const expected = import.meta.env.VITE_MASTER_PIN ?? 'picbook'
    if (!import.meta.env.VITE_MASTER_PIN) {
      // 로컬/초기 개발 편의: 환경변수가 없으면 기본 PIN을 사용합니다.
      // 운영(앱스토어)에서는 반드시 VITE_MASTER_PIN(또는 서버 기반 인증)으로 바꾸세요.
      console.warn('[picbook] VITE_MASTER_PIN이 설정되지 않아 기본 PIN을 사용합니다.')
    }
    if (pin !== String(expected)) {
      return { ok: false, reason: 'PIN이 올바르지 않습니다.' }
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_KEY, 'master')
    }
    set({ role: 'master' })
    return { ok: true }
  },
}))

// 다른 탭/같은 탭 내에서 localStorage가 바뀌는 경우를 대비
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== ROLE_KEY) return
    useUiStore.setState({ role: readRoleFromStorage() })
  })
}
