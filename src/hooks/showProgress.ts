import type { Show } from '../types/show'

function seasonEpisodeLimit(show: Show): number | undefined {
  const known = show.seasonEpisodes?.find((season) => season.season === show.currentSeason)?.episodes
  if (known && known > 0) return known
  return show.seasons === 1 && show.episodes > 0 ? show.episodes : undefined
}

function isFinalSeason(show: Show, season: number): boolean {
  const knownLast = Math.max(show.seasons, ...(show.seasonEpisodes?.map((info) => info.season) ?? []))
  return season >= knownLast
}

export function advanceEpisode(show: Show): Show {
  const knownCurrentSeason = show.seasonEpisodes?.find((season) => season.season === show.currentSeason)
  if (show.status === 'ongoing' && knownCurrentSeason?.episodes === 0) return show
  const limit = seasonEpisodeLimit(show)
  if (!limit || show.currentEpisode < limit) {
    const currentEpisode = show.currentEpisode + 1
    return {
      ...show, currentEpisode,
      watchStatus: limit && currentEpisode === limit && isFinalSeason(show, show.currentSeason) && show.status === 'ended'
        ? 'completed' : 'watching',
    }
  }

  const nextSeason = show.seasonEpisodes
    ?.filter((season) => season.season > show.currentSeason && season.episodes > 0)
    .sort((left, right) => left.season - right.season)[0]
  if (nextSeason || (show.status === 'ended' && !isFinalSeason(show, show.currentSeason))) {
    const currentSeason = nextSeason?.season ?? show.currentSeason + 1
    return {
      ...show, currentSeason, currentEpisode: 1,
      watchStatus: nextSeason?.episodes === 1 && isFinalSeason(show, currentSeason) && show.status === 'ended'
        ? 'completed' : 'watching',
    }
  }

  if (show.status === 'ongoing') return show
  return { ...show, currentEpisode: limit, watchStatus: 'completed' }
}

export function finishCurrentSeason(show: Show): Show {
  return {
    ...show,
    currentEpisode: seasonEpisodeLimit(show) ?? show.currentEpisode,
    watchStatus: isFinalSeason(show, show.currentSeason) && show.status === 'ended' ? 'completed' : 'watching',
  }
}
