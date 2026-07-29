import type { ShowInput } from '../types/show'

/** 首次使用时可选的示例数据（不含 poster） */
export const SEED_SHOWS: ShowInput[] = [
  {
    tmdbId: 1396,
    name: '绝命毒师',
    englishName: 'Breaking Bad',
    country: '美国',
    seasons: 5,
    episodes: 62,
    status: 'ended',
    watchStatus: 'watching',
    currentSeason: 3,
    currentEpisode: 5,
  },
  {
    tmdbId: 1399,
    name: '权力的游戏',
    englishName: 'Game of Thrones',
    country: '美国',
    seasons: 8,
    episodes: 73,
    status: 'ended',
    watchStatus: 'planned',
    currentSeason: 1,
    currentEpisode: 1,
  },
  {
    tmdbId: 60574,
    name: '福斯特医生',
    englishName: 'Doctor Foster',
    country: '英国',
    seasons: 2,
    episodes: 10,
    status: 'ended',
    watchStatus: 'completed',
    currentSeason: 2,
    currentEpisode: 1,
  },
]
