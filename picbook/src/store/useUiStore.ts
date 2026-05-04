import { create } from 'zustand'

const ROLE_KEY = 'picbook.role'
const GOOGLE_USER_KEY = 'picbook.googleUser'

export type AppRole = 'customer' | 'master'

export type GoogleUser = {
  sub: string
  email: string
  name: string
  picture: string | null
}

function readRoleFromStorage(): AppRole {
  if (typeof window === 'undefined') return 'customer'
  const v = window.localStorage.getItem(ROLE_KEY)
  return v === 'master' ? 'master' : 'customer'
}

function readGoogleUserFromStorage(): GoogleUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(GOOGLE_USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleUser>
    if (!parsed.sub || !parsed.email) return null
    return {
      sub: String(parsed.sub),
      email: String(parsed.email),
      name: String(parsed.name ?? parsed.email),
      picture: parsed.picture ? String(parsed.picture) : null,
    }
  } catch {
    return null
  }
}

function decodeJwtPayload(credential: string): Record<string, unknown> | null {
  const [, payload] = credential.split('.')
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    )
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

type UiState = {
  role: AppRole
  googleUser: GoogleUser | null
  setRole: (role: AppRole) => void
  signInWithGoogleCredential: (credential: string) => { ok: true; user: GoogleUser } | { ok: false; reason: string }
  signOutGoogle: () => void
  unlockMasterWithPin: (pin: string) => { ok: true } | { ok: false; reason: string }
}

export const useUiStore = create<UiState>((set) => ({
  role: readRoleFromStorage(),
  googleUser: readGoogleUserFromStorage(),
  setRole: (role) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_KEY, role)
    }
    set({ role })
  },
  signInWithGoogleCredential: (credential) => {
    const payload = decodeJwtPayload(credential)
    const sub = typeof payload?.sub === 'string' ? payload.sub : ''
    const email = typeof payload?.email === 'string' ? payload.email : ''
    const name = typeof payload?.name === 'string' ? payload.name : email
    const picture = typeof payload?.picture === 'string' ? payload.picture : null

    if (!sub || !email) {
      return { ok: false, reason: '구글 로그인 정보를 읽지 못했습니다.' }
    }

    const user: GoogleUser = { sub, email, name, picture }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user))
      window.localStorage.setItem(ROLE_KEY, 'master')
    }
    set({ googleUser: user, role: 'master' })
    return { ok: true, user }
  },
  signOutGoogle: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(GOOGLE_USER_KEY)
      window.localStorage.setItem(ROLE_KEY, 'customer')
    }
    set({ googleUser: null, role: 'customer' })
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
    if (e.key === ROLE_KEY) {
      useUiStore.setState({ role: readRoleFromStorage() })
    }
    if (e.key === GOOGLE_USER_KEY) {
      useUiStore.setState({ googleUser: readGoogleUserFromStorage() })
    }
  })
}
