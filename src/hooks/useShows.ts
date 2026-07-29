import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Show, ShowInput, ShowStats, WatchStatus } from '../types/show'
import { SEED_SHOWS } from '../utils/seed'
import { createShowId, loadShows, saveShows } from '../utils/storage'
import { findTvShowForEnrichment, getTvShowById } from '../utils/tmdb'

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

export function useShows() {
  const [shows, setShows] = useState<Show[]>(() => initShows())

  useEffect(() => {
    saveShows(shows)
  }, [shows])

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
  }, [])

  const updateManyWatchStatus = useCallback((ids: string[], watchStatus: WatchStatus) => {
    const idSet = new Set(ids)
    setShows((prev) => prev.map((show) => (idSet.has(show.id) ? { ...show, watchStatus } : show)))
  }, [])

  const removeManyShows = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setShows((prev) => prev.filter((show) => !idSet.has(show.id)))
  }, [])

  const replaceShows = useCallback((incoming: Show[]) => {
    setShows(incoming)
  }, [])

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
      return prev.filter(
        (show) => show.tmdbId === 0 || earliestByTmdbId.get(show.tmdbId)?.id === show.id,
      )
    })
  }, [])

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
    () => shows.filter((show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes).length,
    [shows],
  )

  const enrichMissingMetadata = useCallback(
    async (onProgress?: (completed: number, total: number) => void) => {
      const targets = shows.filter(
        (show) => show.tmdbId === 0 || !show.poster || !show.seasonEpisodes,
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
  }
}
