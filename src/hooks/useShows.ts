import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Show, ShowInput, ShowStats, WatchStatus } from '../types/show'
import { SEED_SHOWS } from '../utils/seed'
import { createShowId, loadShows, saveShows } from '../utils/storage'
import { findTvShowForEnrichment, getTvShowById } from '../utils/tmdb'
import { deleteCloudShows, fetchCloudShows, upsertCloudShows } from '../utils/supabase'
import { CloudShowSync, pendingShowDraftStorage, type CloudSyncSnapshot } from './cloudShowSync'
import { advanceEpisode, finishCurrentSeason } from './showProgress'

function initShows(): Show[] {
  const existing = loadShows()
  if (existing.length > 0) return existing
  try {
    // A deliberately emptied local library remains empty after refresh.
    if (localStorage.getItem('my-shows') !== null) return existing
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  return SEED_SHOWS.map((input) => ({
    ...input,
    id: createShowId(),
    createdAt: new Date().toISOString(),
  }))
}

function computeStats(shows: Show[]): ShowStats {
  return {
    total: shows.length,
    watching: shows.filter((s) => s.watchStatus === 'watching').length,
    completed: shows.filter((s) => s.watchStatus === 'completed').length,
    planned: shows.filter((s) => s.watchStatus === 'planned').length,
  }
}

function normalizeShowName(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function showAliases(show: Show): Set<string> {
  return new Set(
    [show.name, show.englishName]
      .map(normalizeShowName)
      .filter((name) => name.length >= 2),
  )
}

function isSameShow(left: Show, right: Show): boolean {
  if (left.tmdbId > 0 && right.tmdbId > 0) return left.tmdbId === right.tmdbId
  if (left.year && right.year && left.year !== right.year) return false
  const rightAliases = showAliases(right)
  return [...showAliases(left)].some((alias) => rightAliases.has(alias))
}

function findDuplicateGroups(shows: Show[]): Show[][] {
  const groups: Show[][] = []
  for (const show of shows) {
    const group = groups.find((items) => items.some((item) => isSameShow(item, show)))
    if (group) group.push(show)
    else groups.push([show])
  }
  return groups.filter((group) => group.length > 1)
}

function metadataScore(show: Show): number {
  return Number(show.tmdbId > 0) * 5 + Number(Boolean(show.poster)) * 3 + Number(Boolean(show.year)) * 2 + Number(Boolean(show.seasonEpisodes?.length)) * 2 + Number(show.episodes > 0)
}

function progressScore(show: Show): number {
  const statusWeight: Record<WatchStatus, number> = { completed: 4, watching: 3, dropped: 2, planned: 1 }
  return statusWeight[show.watchStatus] * 1_000_000 + show.currentSeason * 10_000 + show.currentEpisode
}

interface LibrarySnapshot extends Omit<CloudSyncSnapshot, 'syncState'> {
  ownerId?: string
  syncState: 'local' | CloudSyncSnapshot['syncState']
}

export function useShows(userId?: string) {
  const [library, setLibrary] = useState<LibrarySnapshot>(() => ({
    ownerId: userId,
    shows: userId ? [] : initShows(),
    cloudLoading: Boolean(userId),
    cloudReady: !userId,
    syncState: userId ? 'saving' : 'local',
    syncError: null,
  }))
  const libraryRef = useRef(library)
  const controllerRef = useRef<{ userId: string; sync: CloudShowSync } | null>(null)

  useEffect(() => {
    if (!userId) {
      const local: LibrarySnapshot = {
        ownerId: undefined, shows: libraryRef.current.ownerId === undefined ? libraryRef.current.shows : initShows(), cloudLoading: false,
        cloudReady: true, syncState: 'local', syncError: null,
      }
      libraryRef.current = local
      setLibrary(local)
      return
    }
    const initial: LibrarySnapshot = {
      ownerId: userId, shows: [], cloudLoading: true,
      cloudReady: false, syncState: 'saving', syncError: null,
    }
    libraryRef.current = initial
    setLibrary(initial)
    const sync = new CloudShowSync(userId, {
      fetch: fetchCloudShows,
      upsert: upsertCloudShows,
      remove: deleteCloudShows,
      storage: pendingShowDraftStorage,
      onChange(snapshot) {
        const next = { ...snapshot, ownerId: userId }
        libraryRef.current = next
        setLibrary(next)
      },
    })
    controllerRef.current = { userId, sync }
    void sync.load()
    return () => {
      sync.dispose()
      if (controllerRef.current?.sync === sync) controllerRef.current = null
    }
  }, [userId])

  // The scope check also hides old-account rows during an account switch render.
  const currentLibrary = library.ownerId === userId ? library : {
    shows: [], cloudLoading: Boolean(userId), cloudReady: false,
    syncState: userId ? 'saving' as const : 'local' as const, syncError: null,
  }
  const { shows, cloudLoading, cloudReady, syncState, syncError } = currentLibrary

  const persistLocalShows = useCallback(() => {
    const current = libraryRef.current
    if (current.ownerId !== undefined) return
    let syncState: LibrarySnapshot['syncState'] = 'local'
    let syncError: string | null = null
    try {
      saveShows(current.shows)
    } catch {
      syncState = 'error'
      syncError = '无法保存到本机，请勿刷新。请检查浏览器存储设置或可用空间，再点击重新同步。'
    }
    if (current.syncState === syncState && current.syncError === syncError) return
    const next = { ...current, syncState, syncError }
    libraryRef.current = next
    setLibrary(next)
  }, [])

  useEffect(() => {
    if (!userId && library.ownerId === undefined) persistLocalShows()
  }, [library.shows, library.ownerId, userId, persistLocalShows])

  const changeShows = useCallback((transform: (current: Show[]) => Show[]) => {
    const withModifiedTime = (current: Show[]) => {
      const originals = new Map(current.map(show => [show.id, show]))
      const now = new Date().toISOString()
      return transform(current).map(show => {
        const original = originals.get(show.id)
        if (!original) return { ...show, updatedAt: show.updatedAt ?? now }
        return JSON.stringify(original) === JSON.stringify(show) ? show : { ...show, updatedAt: now }
      })
    }
    if (userId) {
      if (controllerRef.current?.userId === userId) controllerRef.current.sync.update(withModifiedTime)
      return
    }
    if (libraryRef.current.ownerId !== undefined) return
    const next = { ...libraryRef.current, shows: withModifiedTime(libraryRef.current.shows) }
    libraryRef.current = next
    setLibrary(next)
  }, [userId])

  const retrySync = useCallback(async () => {
    if (userId && controllerRef.current?.userId === userId) await controllerRef.current.sync.retry()
    else if (!userId) persistLocalShows()
  }, [userId, persistLocalShows])

  const stats = useMemo(() => computeStats(shows), [shows])

  const showsByStatus = useMemo(
    () => ({
      watching: shows.filter((s) => s.watchStatus === 'watching'),
      planned: shows.filter((s) => s.watchStatus === 'planned'),
      completed: shows.filter((s) => s.watchStatus === 'completed'),
      dropped: shows.filter((s) => s.watchStatus === 'dropped'),
    }),
    [shows],
  )

  const addShow = useCallback((input: ShowInput) => {
    const show: Show = {
      ...input,
      id: createShowId(),
      createdAt: new Date().toISOString(),
    }
    changeShows((prev) => [show, ...prev])
  }, [changeShows])

  const updateShow = useCallback((id: string, patch: Partial<Show>) => {
    changeShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [changeShows])

  const updateProgress = useCallback(
    (id: string, currentSeason: number, currentEpisode: number) => {
      updateShow(id, { currentSeason, currentEpisode })
    },
    [updateShow],
  )

  const nextEpisode = useCallback((id: string) => {
    changeShows((prev) => prev.map((show) => show.id === id ? advanceEpisode(show) : show))
  }, [changeShows])

  const completeCurrentSeason = useCallback((id: string) => {
    changeShows((prev) => prev.map((show) => show.id === id ? finishCurrentSeason(show) : show))
  }, [changeShows])

  const setWatchStatus = useCallback(
    (id: string, watchStatus: WatchStatus) => {
      updateShow(id, { watchStatus })
    },
    [updateShow],
  )

  const removeShow = useCallback((id: string) => {
    changeShows((prev) => prev.filter((show) => show.id !== id))
  }, [changeShows])

  const updateManyWatchStatus = useCallback((ids: string[], watchStatus: WatchStatus) => {
    const idSet = new Set(ids)
    changeShows((prev) => prev.map((show) => (idSet.has(show.id) ? { ...show, watchStatus } : show)))
  }, [changeShows])

  const removeManyShows = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    changeShows((prev) => prev.filter((show) => !idSet.has(show.id)))
  }, [changeShows])

  const replaceShows = useCallback((incoming: Show[]) => {
    changeShows(() => incoming)
  }, [changeShows])

  const duplicateTmdbGroupCount = useMemo(() => findDuplicateGroups(shows).length, [shows])

  const deduplicateTmdbShows = useCallback(() => {
    changeShows((prev) => {
      const duplicateGroups = findDuplicateGroups(prev)
      const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.map((show) => show.id)))
      const merged = duplicateGroups.map((group) => {
        const metadataSource = [...group].sort((a, b) => metadataScore(b) - metadataScore(a))[0]
        const progressSource = [...group].sort((a, b) => progressScore(b) - progressScore(a))[0]
        return {
          ...metadataSource,
          watchStatus: progressSource.watchStatus,
          currentSeason: progressSource.currentSeason,
          currentEpisode: progressSource.currentEpisode,
          review: progressSource.review || group.find((show) => show.review?.trim())?.review || '',
          genres: group.some((show) => show.genres !== undefined)
            ? [...new Set(group.flatMap((show) => show.genres ?? []))] : undefined,
          createdAt: [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].createdAt,
        }
      })
      const next = [...merged, ...prev.filter((show) => !duplicateIds.has(show.id))]
      return next
    })
  }, [changeShows])

  const importShows = useCallback((incoming: ShowInput[]) => {
    changeShows((prev) => {
      const existingTmdbIds = new Set(prev.map((s) => s.tmdbId))
      const merged = [...prev]

      for (const input of incoming) {
        if (input.tmdbId && existingTmdbIds.has(input.tmdbId)) continue
        merged.push({
          ...input,
          id: createShowId(),
          createdAt: new Date().toISOString(),
        })
        if (input.tmdbId) existingTmdbIds.add(input.tmdbId)
      }

      return merged
    })
  }, [changeShows])

  const hasTmdbId = useCallback(
    (tmdbId: number) => shows.some((s) => s.tmdbId === tmdbId),
    [shows],
  )

  const unlinkedCount = useMemo(
    () => shows.filter((show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes || !show.year || show.genres === undefined).length,
    [shows],
  )

  const enrichMissingMetadata = useCallback(
    async (onProgress?: (completed: number, total: number) => void) => {
      const targets = shows.filter(
        (show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes || !show.year || show.genres === undefined,
      )
      let updated = 0
      let skipped = 0

      for (const [index, target] of targets.entries()) {
        try {
          const preview = target.tmdbId
            ? await getTvShowById(target.tmdbId)
            : await findTvShowForEnrichment(target.name)
          if (!preview) {
            skipped += 1
          } else {
            changeShows((current) =>
              current.map((show) =>
                show.id === target.id
                  ? {
                      ...show,
                      tmdbId: preview.tmdbId,
                      name: preview.name,
                      englishName: preview.englishName,
                      country: preview.country,
                      year: preview.year,
                      seasons: preview.seasons,
                      episodes: preview.episodes,
                      seasonEpisodes: preview.seasonEpisodes,
                      poster: preview.poster,
                      status: preview.status,
                      genres: show.genres ?? preview.genres ?? [],
                    }
                  : show,
              ),
            )
            updated += 1
          }
        } catch {
          skipped += 1
        }

        onProgress?.(index + 1, targets.length)
        if (index < targets.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 150))
        }
      }

      return { updated, skipped, total: targets.length }
    },
    [shows, changeShows],
  )

  return {
    shows,
    stats,
    showsByStatus,
    addShow,
    updateShow,
    updateProgress,
    nextEpisode,
    completeCurrentSeason,
    setWatchStatus,
    removeShow,
    updateManyWatchStatus,
    removeManyShows,
    replaceShows,
    duplicateTmdbGroupCount,
    deduplicateTmdbShows,
    importShows,
    hasTmdbId,
    unlinkedCount,
    enrichMissingMetadata,
    cloudLoading,
    cloudReady,
    retrySync,
    syncState,
    syncError,
  }
}
