import type { AiringStatus, SeasonInfo, TmdbShowPreview } from '../types/show'

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

interface TmdbSearchItem {
  id: number
  name: string
  original_name: string
  origin_country: string[]
  poster_path: string | null
  overview: string
}

interface TmdbSearchResponse {
  results: TmdbSearchItem[]
}

interface TmdbTvDetail {
  id: number
  name: string
  original_name: string
  origin_country: string[]
  number_of_seasons: number
  number_of_episodes: number
  status: string
  poster_path: string | null
  first_air_date: string
  seasons: Array<{
    season_number: number
    episode_count: number
  }>
}

function mapAiringStatus(tmdbStatus: string): AiringStatus {
  const normalized = tmdbStatus.toLowerCase()
  if (normalized === 'ended' || normalized === 'canceled' || normalized === 'cancelled') {
    return 'ended'
  }
  return 'ongoing'
}

function mapCountry(codes: string[]): string {
  const countryNames: Record<string, string> = {
    US: '美国',
    GB: '英国',
    UK: '英国',
    CA: '加拿大',
    AU: '澳大利亚',
    DE: '德国',
    FR: '法国',
    JP: '日本',
    KR: '韩国',
    CN: '中国',
  }

  if (codes.length === 0) return '未知'
  return codes.map((code) => countryNames[code] ?? code).join(' / ')
}

function toPreview(detail: TmdbTvDetail): TmdbShowPreview {
  return {
    tmdbId: detail.id,
    name: detail.name,
    englishName: detail.original_name,
    country: mapCountry(detail.origin_country),
    year: parseYear(detail.first_air_date),
    seasons: detail.number_of_seasons,
    episodes: detail.number_of_episodes,
    seasonEpisodes: toSeasonInfo(detail.seasons),
    status: mapAiringStatus(detail.status),
    poster: detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : undefined,
  }
}

function parseYear(firstAirDate: string): number | undefined {
  const year = Number(firstAirDate?.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : undefined
}

function toSeasonInfo(seasons: TmdbTvDetail['seasons']): SeasonInfo[] {
  return seasons
    .filter((season) => season.season_number > 0)
    .map((season) => ({ season: season.season_number, episodes: season.episode_count }))
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const url = new URL(`/api/tmdb${path}`, window.location.origin)
  url.searchParams.set('language', 'zh-CN')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(response.status === 503 ? 'TMDB 云端代理尚未配置' : `TMDB 请求失败 (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function searchTvShows(query: string): Promise<TmdbShowPreview[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const data = await tmdbFetch<TmdbSearchResponse>(
    `/search/tv?query=${encodeURIComponent(trimmed)}`,
  )

  const topResults = data.results.slice(0, 5)
  const details = await Promise.all(
    topResults.map((item) => tmdbFetch<TmdbTvDetail>(`/tv/${item.id}`)),
  )

  return details.map(toPreview)
}

/**
 * 用搜索结果的首选匹配补全旧记录。只返回应用需要的精简字段。
 */
export async function findTvShowForEnrichment(query: string): Promise<TmdbShowPreview | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  const data = await tmdbFetch<TmdbSearchResponse>(
    `/search/tv?query=${encodeURIComponent(trimmed)}`,
  )
  const match = data.results[0]
  if (!match) return null

  return getTvShowById(match.id)
}

export async function getTvShowById(tmdbId: number): Promise<TmdbShowPreview> {
  const detail = await tmdbFetch<TmdbTvDetail>(`/tv/${tmdbId}`)
  return toPreview(detail)
}
