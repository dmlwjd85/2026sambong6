import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../store/useUiStore'

export default function HomeRedirect() {
  const navigate = useNavigate()
  const role = useUiStore((s) => s.role)

  useEffect(() => {
    // 고객은 생성 툴킷 대신 서점으로, 마스터는 툴킷(에디터)으로
    navigate(role === 'master' ? '/editor' : '/store', { replace: true })
  }, [navigate, role])

  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-600">이동 중…</div>
  )
}
