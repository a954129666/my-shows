import { useEffect, useState } from 'react'
import { Moon, Spinner, Sun } from '@phosphor-icons/react'

export function LoginScreen({ loading, error, onLogin }: { loading: boolean; error: string | null; onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('my-shows-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('my-shows-theme', theme)
  }, [theme])

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md items-center px-5 py-12">
      <button
        type="button"
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        className="absolute right-5 top-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98]"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onLogin(email.trim(), password)
        }}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-sm"
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-accent)]">My Shows</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">登录我的影视库</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">仅支持已在 Supabase 中创建的账号，不开放注册。</p>
        <label className="mt-6 block text-sm text-[var(--color-muted)]">
          邮箱
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>
        <label className="mt-4 block text-sm text-[var(--color-muted)]">
          密码
          <input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>
        {error && <p className="mt-3 text-sm text-rose-600" role="alert">{error}</p>}
        <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 font-medium text-white disabled:opacity-60">
          {loading && <Spinner size={18} className="animate-spin" />}
          登录
        </button>
      </form>
    </main>
  )
}
