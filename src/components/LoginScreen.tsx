import { useEffect, useState } from 'react'
import type { SignupState } from '../utils/signupState'
import { Moon, Spinner, Sun } from '@phosphor-icons/react'
import { useTheme } from '../hooks/useTheme'

export function LoginScreen({ loading, error, message, recovery, signup, onLeaveWaiting, onAction, onLogin }: { loading: boolean; error: string | null; message: string | null; recovery: boolean; signup: SignupState | null; onLeaveWaiting: () => void; onAction: (mode: 'register' | 'forgot' | 'reset', email: string, password: string) => void; onLogin: (email: string, password: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const current = recovery ? 'reset' : mode
  const labels = { login: '登录我的剧库', register: '创建账号并发送验证邮件', forgot: '发送重置邮件', reset: '保存新密码' }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { theme, toggleTheme } = useTheme()
  const signupEmail = signup?.email
  const signupVerified = signup?.verified
  useEffect(() => {
    if (signupEmail) { setEmail(signupEmail); setPassword(''); setMode('login') }
  }, [signupEmail, signupVerified])

  if (signup && !signup.verified && !recovery) return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 shadow-sm" aria-live="polite">
        <p className="text-xs font-semibold text-[var(--color-accent)]">MY SHOWS · 邮箱验证</p>
        <div className="mt-5 flex items-center gap-3"><Spinner size={24} className="animate-spin text-[var(--color-accent)]" /><h1 className="text-2xl font-semibold">等待邮箱确认</h1></div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">验证邮件已发送至</p>
        <p className="mt-1 break-all font-medium">{signup.email}</p>
        <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">请前往邮箱点击验证链接。保留此页面，同一浏览器完成验证后会自动更新；随后输入密码登录。</p>
        <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">没有收到？请检查垃圾邮件。若在其他设备验证，返回此页登录即可。</p>
        <button type="button" onClick={() => { setEmail(signup.email); setMode('login'); onLeaveWaiting() }} className="mt-5 min-h-11 w-full rounded-xl border border-[var(--color-border)] px-4 text-sm font-medium">已验证，返回登录</button>
      </section>
    </main>
  )

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
        {signup?.verified && <p className="mt-4 rounded-lg bg-[var(--color-accent-muted)] px-3 py-3 text-sm text-[var(--color-accent)]" role="status">邮箱已确认，请输入密码登录。也可以返回原来的页面继续。</p>}
        {(current === 'login' || current === 'register') && <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--color-surface)] p-1" role="group" aria-label="账号操作">
          {(['login', 'register'] as const).map((item) => <button
            key={item}
            type="button"
            disabled={loading}
            aria-pressed={current === item}
            onClick={() => setMode(item)}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${current === item ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-sm' : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'}`}
          >{item === 'login' ? '登录' : '创建账号'}</button>)}
        </div>}
        <h1 className="mt-5 text-2xl font-semibold text-[var(--color-ink)]">{current === 'login' ? '欢迎回来' : current === 'register' ? '创建你的私人剧库' : '重置密码'}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{current === 'login' ? '登录后，继续记录你的观看进度。' : current === 'register' ? '用邮箱创建账号，验证后即可在电脑和手机同步记录。' : current === 'forgot' ? '输入注册邮箱，我们会发送密码重置链接。' : '设置一个至少 8 位的新密码。'}</p>
        {current !== 'reset' && <label className="mt-6 block text-sm text-[var(--color-muted)]">
          邮箱
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>}
        {current !== 'forgot' && <label className="mt-4 block text-sm text-[var(--color-muted)]">
          密码
          <input type="password" required minLength={current === 'login' ? 6 : 8} aria-describedby={current === 'register' || current === 'reset' ? 'password-hint' : undefined} autoComplete={current === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-ink)]" />
        </label>}
        {(current === 'register' || current === 'reset') && <p id="password-hint" className="mt-2 text-xs text-[var(--color-muted)]">密码至少 8 位。</p>}
        {error && <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">{error}</p>}
        {message && <p className="mt-3 text-sm text-[var(--color-accent)]" role="status">{message}</p>}
        <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 font-medium text-[var(--color-accent-contrast)] disabled:opacity-60">
          {loading && <Spinner size={18} className="animate-spin" />}
          {labels[current]}
        </button>
        {!recovery && <div className="mt-3 flex justify-end text-sm text-[var(--color-accent)]">
          {current === 'forgot' ? <button type="button" disabled={loading} onClick={() => setMode('login')} className="min-h-10 px-2">返回登录</button> : current === 'login' ? <button type="button" disabled={loading} onClick={() => setMode('forgot')} className="min-h-10 px-2">忘记密码？</button> : null}
        </div>}
        <a className="mt-5 block text-xs text-[var(--color-accent)]" href="/beta.html">公测与隐私说明 · 数据来源</a>
      </form>
    </main>
  )
}
