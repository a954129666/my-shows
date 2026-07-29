import type { CsvImportRow, ShowInput, WatchStatus } from '../types/show'

const WATCH_STATUS_MAP: Record<string, WatchStatus> = {
  watching: 'watching',
  completed: 'completed',
  planned: 'planned',
  dropped: 'dropped',
  正在观看: 'watching',
  已完成: 'completed',
  已看完: 'completed',
  待观看: 'planned',
}

const LEGACY_STATUS_COLUMNS: Record<string, WatchStatus> = {
  已完结: 'completed',
  没全看完: 'dropped',
  追完当季未完结: 'watching',
  未完待看: 'planned',
  完结可看: 'planned',
}

export function parseProgress(raw: string): { season: number; episode: number } {
  const match = raw.trim().match(/S(\d+)E(\d+)/i)
  if (!match) return { season: 1, episode: 1 }
  return { season: Number(match[1]), episode: Number(match[2]) }
}

export function formatProgress(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

export function parseCsvToShows(csvText: string): ShowInput[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

  if (lines.length === 0) return []

  if (lines[1] && lines[1].includes('已完结') && lines[1].includes('未完待看')) {
    return parseLegacyShowList(lines)
  }

  const dataLines = lines[0].includes('剧名') ? lines.slice(1) : lines

  return dataLines
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      if (parts.length < 5) return null

      const [name, country, seasonsRaw, statusRaw, progressRaw] = parts
      const watchStatus = WATCH_STATUS_MAP[statusRaw.toLowerCase()] ?? 'planned'
      const progress = parseProgress(progressRaw)

      const row: CsvImportRow = {
        name,
        country,
        seasons: Number(seasonsRaw) || 1,
        watchStatus,
        season: progress.season,
        episode: progress.episode,
      }

      return csvRowToShowInput(row)
    })
    .filter((item): item is ShowInput => item !== null)
}

/** 兼容早期按观看状态分栏整理的个人剧集清单。 */
function parseLegacyShowList(lines: string[]): ShowInput[] {
  const headers = lines[1].split(',').map((item) => item.trim())

  return lines.slice(2).flatMap((line) =>
    line.split(',').flatMap((cell, index) => {
      const rawName = cell.trim()
      const watchStatus = LEGACY_STATUS_COLUMNS[headers[index]]
      if (!rawName || !watchStatus) return []

      return [legacyCellToShowInput(rawName, watchStatus)]
    }),
  )
}

function legacyCellToShowInput(rawName: string, watchStatus: WatchStatus): ShowInput {
  const explicitProgress = rawName.match(/[sS]\s*(\d+)\s*[eE]\s*(\d+)/)
  const seasonRange = rawName.match(/(\d+)\s*-\s*(\d+)(?=\s*[（(]?)/)
  const singleSeason = rawName.match(/(\d+)(?:\s*[？?])?(?=\s*[（(]?\s*$)/)
  const seasonMatch = seasonRange ?? singleSeason
  const seasons = seasonRange ? Number(seasonRange[2]) : Number(singleSeason?.[1]) || 1
  const name = (seasonMatch ? rawName.slice(0, seasonMatch.index) : rawName)
    .replace(/[（(].*$/, '')
    .trim()

  return {
    tmdbId: 0,
    name: name || rawName,
    englishName: name || rawName,
    country: '待补充',
    seasons,
    episodes: 0,
    status: watchStatus === 'watching' ? 'ongoing' : 'ended',
    watchStatus,
    currentSeason: explicitProgress ? Number(explicitProgress[1]) : seasons,
    currentEpisode: explicitProgress ? Number(explicitProgress[2]) : 1,
  }
}

function csvRowToShowInput(row: CsvImportRow): ShowInput {
  return {
    tmdbId: 0,
    name: row.name,
    englishName: row.name,
    country: row.country,
    seasons: row.seasons,
    episodes: row.seasons * 10,
    status: 'ended',
    watchStatus: row.watchStatus,
    currentSeason: row.season,
    currentEpisode: row.episode,
  }
}
