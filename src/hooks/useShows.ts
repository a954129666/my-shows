import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Show, ShowInput, ShowStats, WatchStatus } from '../types/show'
import { SEED_SHOWS } from '../utils/seed'
import { createShowId, loadShows, saveShows } from '../utils/storage'
import { findTvShowForEnrichment, getTvShowById } from '../utils/tmdb'
import { deleteCloudShows, fetchCloudShows, replaceCloudShows, upsertCloudShows } from '../utils/supabase'

function initShows(): Show[] {
  const existing = loadShows()
  if (existing.length > 0) return existing

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

export function useShows(userId?: string) {
  const [shows, setShows] = useState<Show[]>(() => initShows())
  const localCandidateRef = useRef<Show[]>(loadShows())
  const [cloudLoading, setCloudLoading] = useState(Boolean(userId))
  const [cloudReady, setCloudReady] = useState(false)
  const [syncState, setSyncState] = useState<'local' | 'saving' | 'saved' | 'error'>(userId ? 'saving' : 'local')
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) saveShows(shows)
  }, [shows, userId])

  useEffect(() => {
    if (!userId) return
    let active = true
    setCloudLoading(true)
    setCloudReady(false)
    fetchCloudShows()
      .then((remoteShows) => {
        if (!active) return
        setShows(remoteShows)
        setSyncState('saved')
        setSyncError(null)
        setCloudReady(true)
      })
      .catch((reason) => {
        if (!active) return
        setSyncState('error')
        setSyncError(reason instanceof Error ? reason.message : '无法读取云端数据')
      })
      .finally(() => {
        if (active) setCloudLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !cloudReady) return
    setSyncState('saving')
    const timer = window.setTimeout(() => {
      upsertCloudShows(shows, userId)
        .then(() => {
          setSyncState('saved')
          setSyncError(null)
        })
        .catch((reason) => {
          setSyncState('error')
          setSyncError(reason instanceof Error ? reason.message : '云端保存失败')
        })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [shows, userId, cloudReady])

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
    setShows((prev) => [show, ...prev])
  }, [])

  const updateShow = useCallback((id: string, patch: Partial<Show>) => {
    setShows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const updateProgress = useCallback(
    (id: string, currentSeason: number, currentEpisode: number) => {
      updateShow(id, { currentSeason, currentEpisode })
    },
    [updateShow],
  )

  const nextEpisode = useCallback((id: string) => {
    setShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show

        const currentSeasonInfo = show.seasonEpisodes?.find(
          (season) => season.season === show.currentSeason,
        )
        const episodeLimit = currentSeasonInfo?.episodes
        if (!episodeLimit || show.currentEpisode < episodeLimit) {
          return { ...show, currentEpisode: show.currentEpisode + 1 }
        }

        const nextSeason = show.seasonEpisodes?.find(
          (season) => season.season === show.currentSeason + 1,
        )
        if (nextSeason || show.currentSeason < show.seasons) {
          return {
            ...show,
            currentSeason: nextSeason?.season ?? show.currentSeason + 1,
            currentEpisode: 1,
          }
        }

        return {
          ...show,
          currentEpisode: episodeLimit,
          watchStatus: 'completed',
        }
      }),
    )
  }, [])

  const completeCurrentSeason = useCallback((id: string) => {
    setShows((prev) =>
      prev.map((show) => {
        if (show.id !== id) return show

        const currentSeasonInfo = show.seasonEpisodes?.find(
          (season) => season.season === show.currentSeason,
        )
        const nextSeason = show.seasonEpisodes?.find(
          (season) => season.season === show.currentSeason + 1,
        )
        const finalEpisode = currentSeasonInfo?.episodes ?? show.currentEpisode

        if (nextSeason || show.currentSeason < show.seasons) {
          return {
            ...show,
            currentSeason: nextSeason?.season ?? show.currentSeason + 1,
            currentEpisode: 1,
          }
        }

        return { ...show, currentEpisode: finalEpisode, watchStatus: 'completed' }
      }),
    )
  }, [])

  const setWatchStatus = useCallback(
    (id: string, watchStatus: WatchStatus) => {
      updateShow(id, { watchStatus })
    },
    [updateShow],
  )

  const removeShow = useCallback((id: string) => {
    setShows((prev) => prev.filter((show) => show.id !== id))
    if (userId) deleteCloudShows([id]).catch(() => setSyncState('error'))
  }, [userId])

  const updateManyWatchStatus = useCallback((ids: string[], watchStatus: WatchStatus) => {
    const idSet = new Set(ids)
    setShows((prev) => prev.map((show) => (idSet.has(show.id) ? { ...show, watchStatus } : show)))
  }, [])

  const removeManyShows = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setShows((prev) => prev.filter((show) => !idSet.has(show.id)))
    if (userId) deleteCloudShows(ids).catch(() => setSyncState('error'))
  }, [userId])

  const replaceShows = useCallback((incoming: Show[]) => {
    setShows(incoming)
    if (userId) {
      setSyncState('saving')
      replaceCloudShows(incoming, userId)
        .then(() => setSyncState('saved'))
        .catch((reason) => {
          setSyncState('error')
          setSyncError(reason instanceof Error ? reason.message : '恢复云端备份失败')
        })
    }
  }, [userId])

  const duplicateTmdbGroupCount = useMemo(() => {
    const counts = new Map<number, number>()
    shows.filter((show) => show.tmdbId > 0).forEach((show) => {
      counts.set(show.tmdbId, (counts.get(show.tmdbId) ?? 0) + 1)
    })
    return [...counts.values()].filter((count) => count > 1).length
  }, [shows])

  const deduplicateTmdbShows = useCallback(() => {
    setShows((prev) => {
      const earliestByTmdbId = new Map<number, Show>()
      prev.filter((show) => show.tmdbId > 0).forEach((show) => {
        const existing = earliestByTmdbId.get(show.tmdbId)
        if (!existing || show.createdAt < existing.createdAt) earliestByTmdbId.set(show.tmdbId, show)
      })
      const next = prev.filter(
        (show) => show.tmdbId === 0 || earliestByTmdbId.get(show.tmdbId)?.id === show.id,
      )
      if (userId) {
        const keptIds = new Set(next.map((show) => show.id))
        deleteCloudShows(prev.filter((show) => !keptIds.has(show.id)).map((show) => show.id)).catch(() => setSyncState('error'))
      }
      return next
    })
  }, [userId])

  const migrateLocalShows = useCallback(async () => {
    if (!userId || localCandidateRef.current.length === 0) return 0
    const existingTmdbIds = new Set(shows.filter((show) => show.tmdbId > 0).map((show) => show.tmdbId))
    const existingNames = new Set(shows.map((show) => show.name.trim().toLocaleLowerCase()))
    const candidates = localCandidateRef.current.filter(
      (show) =>
        (show.tmdbId <= 0 || !existingTmdbIds.has(show.tmdbId)) &&
        !existingNames.has(show.name.trim().toLocaleLowerCase()),
    )
    if (candidates.length === 0) return 0
    setSyncState('saving')
    await upsertCloudShows(candidates, userId)
    setShows((current) => [...candidates, ...current])
    localCandidateRef.current = []
    setSyncState('saved')
    return candidates.length
  }, [shows, userId])

  const importShows = useCallback((incoming: ShowInput[]) => {
    setShows((prev) => {
      const existingTmdbIds = new Set(prev.map((s) => s.tmdbId))
      const merged = [...prev]

      for (const input of incoming) {
        if (input.tmdbId && existingTmdbIds.has(input.tmdbId)) continue
        merged.push({
          ...input,
          id: createShowId(),
          createdAt: new Date().toISOString(),
        })
      }

      return merged
    })
  }, [])

  const hasTmdbId = useCallback(
    (tmdbId: number) => shows.some((s) => s.tmdbId === tmdbId),
    [shows],
  )

  const unlinkedCount = useMemo(
    () => shows.filter((show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes || !show.year).length,
    [shows],
  )

  const enrichMissingMetadata = useCallback(
    async (onProgress?: (completed: number, total: number) => void) => {
      const targets = shows.filter(
        (show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes || !show.year,
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
            setShows((current) =>
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
    [shows],
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
    syncState,
    syncError,
    localImportCount: userId ? localCandidateRef.current.length : 0,
    migrateLocalShows,
  }
}
