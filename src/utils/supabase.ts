import type { Show } from '../types/show'
import { saveSignupState } from './signupState'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SESSION_KEY = 'my-shows-supabase-session'

export const isSupabaseConfigured = Boolean(supabaseUrl && anonKey)

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email?: string }
}

interface ShowRow {
  id: string
  user_id: string
  tmdb_id: number
  name: string
  english_name: string
  country: string
  year: number | null
  seasons: number
  episodes: number
  season_episodes: Show['seasonEpisodes'] | null
  poster: string | null
  airing_status: Show['status']
  watch_status: Show['watchStatus']
  current_season: number
  current_episode: number
  created_at: string
  updated_at?: string
  genres?: string[] | null
  review?: string | null
}

function requireConfig() {
  if (!supabaseUrl || !anonKey) throw new Error('Supabase 尚未配置')
  return { supabaseUrl, anonKey }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; msg?: string; error_description?: string; error?: string; error_code?: string; code?: string } | null
    const code = body?.error_code ?? body?.code
    const messages: Record<string, string> = {
      email_address_invalid: '邮箱地址无效，请使用可以正常收信的真实邮箱。',
      email_address_not_authorized: '当前发信服务不允许向该邮箱发送邮件，请管理员检查 Supabase Custom SMTP 配置。',
      weak_password: '密码不符合要求，请按网站的密码规则设置，建议使用至少 8 位并包含大小写字母、数字和符号。',
      signup_disabled: '网站尚未开放注册，请管理员在 Supabase 中启用注册。',
      email_provider_disabled: '邮箱注册尚未开启，请管理员检查 Supabase Email 设置。',
      user_already_exists: '该邮箱已注册，请直接登录或使用忘记密码。',
      captcha_failed: '验证码验证失败或尚未接入，请管理员检查验证码配置。',
      over_email_send_rate_limit: '验证邮件发送过于频繁，请稍后重试。',
      email_not_confirmed: '邮箱尚未验证，请先点击验证邮件中的链接。',
      invalid_credentials: '邮箱或密码不正确，请检查后重试。',
    }
    const detail = body?.message ?? body?.msg ?? body?.error_description ?? body?.error
    throw new Error((code && messages[code]) ? `${messages[code]}（${code}）` : detail ? `${detail} (${response.status}${code ? `, ${code}` : ''})` : `请求失败 (${response.status}${code ? `, ${code}` : ''})`)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function loadStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}

function storeSession(session: AuthSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

export async function register(email: string, password: string): Promise<void> {
  const config = requireConfig()
  await parseResponse(await fetch(`${config.supabaseUrl}/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin)}`, {
    method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }))
}

export async function requestPasswordReset(email: string): Promise<void> {
  const config = requireConfig()
  await parseResponse(await fetch(`${config.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin)}`, {
    method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  }))
}

export async function acceptEmailCallback(): Promise<'recovery' | 'signup' | null> {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const token = hash.get('access_token')
  const refresh = hash.get('refresh_token')
  if (!token || !refresh) return null
  const config = requireConfig()
  const user = await parseResponse<AuthSession['user']>(await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
  }))
  const recovery = hash.get('type') === 'recovery'
  if (recovery) {
    storeSession({ access_token: token, refresh_token: refresh, user, expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') ?? 3600) })
  } else {
    storeSession(null)
    if (user.email) saveSignupState({ email: user.email, verified: true })
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return recovery ? 'recovery' : 'signup'
}

export async function updatePassword(password: string): Promise<void> {
  const config = requireConfig()
  const session = await restoreSession()
  if (!session) throw new Error('重置链接已过期，请重新申请')
  await parseResponse(await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }))
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const config = requireConfig()
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = await parseResponse<AuthSession>(response)
  session.expires_at ??= Math.floor(Date.now() / 1000) + 3600
  storeSession(session)
  return session
}

export async function restoreSession(): Promise<AuthSession | null> {
  const existing = loadStoredSession()
  if (!existing) return null
  if ((existing.expires_at ?? 0) > Math.floor(Date.now() / 1000) + 60) return existing

  try {
    const config = requireConfig()
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: existing.refresh_token }),
    })
    const session = await parseResponse<AuthSession>(response)
    session.expires_at ??= Math.floor(Date.now() / 1000) + 3600
    storeSession(session)
    return session
  } catch {
    storeSession(null)
    return null
  }
}

export async function signOut(): Promise<void> {
  const session = loadStoredSession()
  const config = requireConfig()
  if (session) {
    await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined)
  }
  storeSession(null)
}

async function databaseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const config = requireConfig()
  const session = await restoreSession()
  if (!session) throw new Error('登录已过期，请重新登录')
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  return parseResponse<T>(response)
}

function rowToShow(row: ShowRow): Show {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    name: row.name,
    englishName: row.english_name,
    country: row.country,
    year: row.year ?? undefined,
    seasons: row.seasons,
    episodes: row.episodes,
    seasonEpisodes: row.season_episodes ?? undefined,
    poster: row.poster ?? undefined,
    status: row.airing_status,
    watchStatus: row.watch_status,
    currentSeason: row.current_season,
    currentEpisode: row.current_episode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    genres: row.genres ?? undefined,
    review: row.review ?? undefined,
  }
}

function showToRow(show: Show, userId: string): ShowRow {
  return {
    id: show.id,
    user_id: userId,
    tmdb_id: show.tmdbId,
    name: show.name,
    english_name: show.englishName,
    country: show.country,
    year: show.year ?? null,
    seasons: show.seasons,
    episodes: show.episodes,
    season_episodes: show.seasonEpisodes ?? null,
    poster: show.poster ?? null,
    airing_status: show.status,
    watch_status: show.watchStatus,
    current_season: show.currentSeason,
    current_episode: show.currentEpisode,
    created_at: show.createdAt,
    ...(show.genres !== undefined ? { genres: show.genres } : {}),
    ...(show.review !== undefined ? { review: show.review } : {}),
  }
}

export async function fetchCloudShows(): Promise<Show[]> {
  const rows = await databaseFetch<ShowRow[]>('shows?select=*&order=created_at.desc')
  return rows.map(rowToShow)
}

export async function upsertCloudShows(shows: Show[], userId: string): Promise<void> {
  if (shows.length === 0) return
  // PostgREST batches require uniform keys. Legacy-only writes omit the new columns.
  const withGenres = shows.some((show) => show.genres !== undefined)
  const withReviews = shows.some((show) => show.review !== undefined)
  try {
    await databaseFetch('shows?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(shows.map((show) => ({
        ...showToRow(show, userId),
        ...(withGenres ? { genres: show.genres ?? null } : {}),
        ...(withReviews ? { review: show.review ?? '' } : {}),
      }))),
    })
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : ''
    if (/\b(genres|review)\b/.test(message) && /column|schema cache|does not exist/i.test(message)) {
      throw new Error('云端尚未启用类别和短评字段，请完成数据库更新后重新同步')
    }
    throw reason
  }
}

export async function deleteCloudShows(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const encodedIds = ids.map((id) => `"${id}"`).join(',')
  await databaseFetch(`shows?id=in.(${encodeURIComponent(encodedIds)})`, { method: 'DELETE' })
}

export async function replaceCloudShows(shows: Show[], userId: string): Promise<void> {
  await databaseFetch('shows?id=not.is.null', { method: 'DELETE' })
  await upsertCloudShows(shows, userId)
}
