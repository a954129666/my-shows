/** TMDB 播出状态：是否完结 */
export type AiringStatus = 'ended' | 'ongoing'

/** 个人观看列表状态 */
export type WatchStatus = 'watching' | 'completed' | 'planned' | 'dropped'

/** 单季的精简信息，用于显示每季集数 */
export interface SeasonInfo {
  season: number
  episodes: number
}

/** 本地持久化的剧集数据（不含海报等 TMDB 冗余字段） */
export interface Show {
  id: string
  tmdbId: number
  name: string
  englishName: string
  country: string
  /** 首播年份；旧数据未补全时为空 */
  year?: number
  seasons: number
  episodes: number
  /** 每季集数，只保存季号和集数 */
  seasonEpisodes?: SeasonInfo[]
  /** TMDB 海报 URL，只保存链接，不保存图片文件或原始响应 */
  poster?: string
  /** TMDB 播出状态 */
  status: AiringStatus
  /** 个人观看列表分类 */
  watchStatus: WatchStatus
  currentSeason: number
  currentEpisode: number
  createdAt: string
}

/** 添加前获取的完整 TMDB 剧集资料。 */
export interface TmdbShowPreview {
  tmdbId: number
  name: string
  englishName: string
  country: string
  year?: number
  seasons: number
  episodes: number
  seasonEpisodes: SeasonInfo[]
  status: AiringStatus
  poster?: string
}

export interface ShowStats {
  total: number
  watching: number
  completed: number
  planned: number
}

export interface CsvImportRow {
  name: string
  country: string
  seasons: number
  watchStatus: WatchStatus
  season: number
  episode: number
}

export type ShowInput = Omit<Show, 'id' | 'createdAt'>
