import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/useUiStore'

export function GoogleLoginButton() {
  const signInWithGoogleCredential = useUiStore((s) => s.signInWithGoogleCredential)
  const [error, setError] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => {
    let cancelled = false

    if (!clientId) {
      return
    }

    const render = () => {
      if (cancelled || !hostRef.current) return
      const googleId = window.google?.accounts?.id
      if (!googleId) return

      hostRef.current.innerHTML = ''
      googleId.initialize({
        client_id: clientId,
        callback: (response) => {
          const credential = response.credential
          if (!credential) {
            setError('구글 로그인 응답에 credential이 없습니다.')
            return
          }
          const res = signInWithGoogleCredential(credential)
          if (!res.ok) setError(res.reason)
        },
      })
      googleId.renderButton(hostRef.current, {
        theme: 'outline',
        size: 'medium',
        text: 'signin_with',
        shape: 'pill',
        width: 180,
      })
      setError(null)
    }

    const timer = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        window.clearInterval(timer)
        render()
      }
    }, 200)

    window.setTimeout(() => {
      if (!window.google?.accounts?.id) {
        window.clearInterval(timer)
        setError('구글 로그인 스크립트를 불러오지 못했습니다.')
      }
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [clientId, signInWithGoogleCredential])

  const visibleError = !clientId ? 'VITE_GOOGLE_CLIENT_ID가 없어 구글 로그인 버튼을 표시할 수 없습니다.' : error

  return (
    <div className="flex flex-col items-end gap-1">
      <div ref={hostRef} className="min-h-[32px]" />
      {visibleError ? <div className="max-w-[220px] text-right text-[11px] leading-snug text-amber-700">{visibleError}</div> : null}
    </div>
  )
}
