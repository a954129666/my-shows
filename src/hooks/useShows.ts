import { useCallback, useEffect, useMemo, useState } from 'react'
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

export function useShows(userId?: string) {
  const [shows, setShows] = useState<Show[]>(() => initShows())
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

  const duplicateTmdbGroupCount = useMemo(() => findDuplicateGroups(shows).length, [shows])

  const deduplicateTmdbShows = useCallback(() => {
    setShows((prev) => {
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
          createdAt: [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].createdAt,
        }
      })
      const next = [...merged, ...prev.filter((show) => !duplicateIds.has(show.id))]
      if (userId) {
        const keptIds = new Set(next.map((show) => show.id))
        deleteCloudShows(prev.filter((show) => !keptIds.has(show.id)).map((show) => show.id)).catch(() => setSyncState('error'))
      }
      return next
    })
  }, [userId])

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
  }
}
