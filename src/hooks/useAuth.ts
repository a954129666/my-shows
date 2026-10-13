import { useEffect, useState } from 'react'
import { readSignupState, saveSignupState, SIGNUP_STATE_KEY } from '../utils/signupState'
import { acceptEmailCallback, isSupabaseConfigured, register, requestPasswordReset, updatePassword, restoreSession, signIn, signOut, type AuthSession } from '../utils/supabase'

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const [signup, setSignup] = useState(readSignupState)

  useEffect(() => {
    const sync = () => setSignup(readSignupState())
    const onStorage = (event: StorageEvent) => { if (event.key === SIGNUP_STATE_KEY) sync() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', sync)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', sync) }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    acceptEmailCallback().then(async (type) => {
      setRecovery(type === 'recovery')
      if (type === 'signup') { setSignup(readSignupState()); setMessage('邮箱已确认，请输入密码登录。'); setSession(null); return }
      setSession(await restoreSession())
    }).catch(() => setError('邮件链接失效或连接失败，请重新申请')).finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      setSession(await signIn(email, password))
      saveSignupState(null)
      setSignup(null)
    } catch (reason) {
      setError(reason instanceof TypeError ? '连接失败，请检查网络后重试' : reason instanceof Error ? reason.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await signOut()
    setSession(null)
  }

  async function accountAction(mode: 'register' | 'forgot' | 'reset', email: string, password: string) {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'register') {
        await register(email, password)
        const next = { email, verified: false }
        saveSignupState(next)
        setSignup(next)
        setMessage('验证邮件已发送，请在邮箱中点击确认链接。')
      }
      if (mode === 'forgot') { await requestPasswordReset(email); setMessage('如果该邮箱已注册，你将收到密码重置邮件。') }
      if (mode === 'reset') { await updatePassword(password); setRecovery(false); setMessage('密码已更新') }
    } catch (reason) {
      setError(reason instanceof TypeError ? '连接失败，请检查网络后重试' : reason instanceof Error ? reason.message : '操作失败')
    } finally { setLoading(false) }
  }

  function leaveWaiting() { saveSignupState(null); setSignup(null); setMessage(null); setError(null) }
  return { configured: isSupabaseConfigured, session, loading, error, message, recovery, signup, leaveWaiting, accountAction, login, logout }
}
