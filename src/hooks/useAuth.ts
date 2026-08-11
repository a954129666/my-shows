import { useEffect, useState } from 'react'
import { isSupabaseConfigured, restoreSession, signIn, signOut, type AuthSession } from '../utils/supabase'

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    restoreSession().then(setSession).finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    setLoading(true)
    setError(null)
    try {
      setSession(await signIn(email, password))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await signOut()
    setSession(null)
  }

  return { configured: isSupabaseConfigured, session, loading, error, login, logout }
}
