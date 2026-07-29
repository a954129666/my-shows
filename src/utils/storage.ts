import type { Show } from '../types/show'

const STORAGE_KEY = 'my-shows'

export function loadShows(): Show[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Show[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveShows(shows: Show[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shows))
}

export function createShowId(): string {
  return crypto.randomUUID()
}

/** 未来接入 Supabase 时，替换此模块的读写实现即可 */
export const storage = {
  load: loadShows,
  save: saveShows,
}
