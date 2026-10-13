import { useState } from 'react'
import { Moon, Spinner, Sun } from '@phosphor-icons/react'
import { useTheme } from '../hooks/useTheme'

export function LoginScreen({ loading, error, message, recovery, onAction, onLogin }: { loading: boolean; error: string | null; message: string | null; recovery: boolean; onAction: (mode: 'register' | 'forgot' | 'reset', email: string, password: string) => void; onLogin: (email: string, password: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const current = recovery ? 'reset' : mode
  const labels = { login: '登录', register: '注册', forgot: '发送重置邮件', reset: '保存新密码' }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { theme, toggleTheme } = useTheme()

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md items-center px-5 py-12">
      <button
        type="button"
        onClick={toggleTheme}
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        className="absolute right-5 top-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98]"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (current === 'login') onLogin(email.trim(), password)
          else onAction(current, email.trim(), password)
        }}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-sm"
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-accent)]">My Shows</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{current === 'login' ? '登录我的影视库' : current === 'register' ? '创建我的影视库' : '重置密码'}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">公开测试版 · 每个人都有自己的私人剧库</p>
        {current !== 'reset' && <label className="mt-6 block text-sm text-[var(--color-muted)]">
          邮箱
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>}
        {current !== 'forgot' && <label className="mt-4 block text-sm text-[var(--color-muted)]">
          密码
          <input type="password" required minLength={current === 'login' ? 6 : 8} autoComplete={current === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>}
        {error && <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">{error}</p>}
        {message && <p className="mt-3 text-sm text-[var(--color-accent)]" role="status">{message}</p>}
        <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 font-medium text-[var(--color-accent-contrast)] disabled:opacity-60">
          {loading && <Spinner size={18} className="animate-spin" />}
          {labels[current]}
        </button>
        {!recovery && <div className="mt-4 flex justify-between text-sm text-[var(--color-accent)]">
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '创建账号' : '返回登录'}</button>
          <button type="button" onClick={() => setMode('forgot')}>忘记密码</button>
        </div>}
        <a className="mt-5 block text-xs text-[var(--color-accent)]" href="/beta.html">公测与隐私说明 · 数据来源</a>
      </form>
    </main>
  )
}
