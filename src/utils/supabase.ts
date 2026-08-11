import type { Show } from '../types/show'

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
}

function requireConfig() {
  if (!supabaseUrl || !anonKey) throw new Error('Supabase 尚未配置')
  return { supabaseUrl, anonKey }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; error_description?: string } | null
    throw new Error(body?.message ?? body?.error_description ?? `请求失败 (${response.status})`)
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
  }
}

export async function fetchCloudShows(): Promise<Show[]> {
  const rows = await databaseFetch<ShowRow[]>('shows?select=*&order=created_at.desc')
  return rows.map(rowToShow)
}

export async function upsertCloudShows(shows: Show[], userId: string): Promise<void> {
  if (shows.length === 0) return
  await databaseFetch('shows?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(shows.map((show) => showToRow(show, userId))),
  })
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
