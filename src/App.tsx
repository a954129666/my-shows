import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowsClockwise,
  DownloadSimple,
  FileArrowUp,
  ListBullets,
  MagnifyingGlass,
  SignOut,
  Spinner,
  SquaresFour,
  UploadSimple,
  DotsThree,
  Moon,
  Sun,
  TelevisionSimple,
  SlidersHorizontal,
  X,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import { SearchBar } from './components/SearchBar'
import { ShowCard } from './components/ShowCard'
import { LoginScreen } from './components/LoginScreen'
import { useAuth } from './hooks/useAuth'
import { useShows } from './hooks/useShows'
import { useTheme } from './hooks/useTheme'
import type { AiringStatus, Show, TmdbShowPreview, WatchStatus } from './types/show'
import { parseCsvToShows } from './utils/csv'

type WatchFilter = WatchStatus | 'all'
type SortOrder = 'recent' | 'name' | 'progress'
type MetadataFilter = 'all' | 'complete' | 'incomplete'
type SeasonFilter = 'all' | 'single' | 'multiple'

function savedPreference<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    if (values.includes(value as T)) return value as T
  } catch { /* Preferences are optional when browser storage is unavailable. */ }
  return fallback
}

function hasCompleteMetadata(show: Show): boolean {
  return show.tmdbId > 0 && Boolean(show.poster && show.year && show.seasonEpisodes?.length) && show.genres !== undefined
}

function isShowBackup(value: unknown): value is Show[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  const integerAtLeast = (number: unknown, minimum: number) =>
    typeof number === 'number' && Number.isInteger(number) && number >= minimum
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const show = item as Partial<Show>
    if (typeof show.id !== 'string' || !show.id.trim() || ids.has(show.id)
      || typeof show.name !== 'string' || !show.name.trim()
      || typeof show.englishName !== 'string' || typeof show.country !== 'string'
      || typeof show.createdAt !== 'string' || !Number.isFinite(Date.parse(show.createdAt))
      || !integerAtLeast(show.tmdbId, 0) || !integerAtLeast(show.seasons, 0)
      || !integerAtLeast(show.episodes, 0) || !integerAtLeast(show.currentSeason, 1)
      || !integerAtLeast(show.currentEpisode, 0)
      || !['ended', 'ongoing'].includes(show.status ?? '')
      || !['watching', 'completed', 'planned', 'dropped'].includes(show.watchStatus ?? '')
      || (show.year !== undefined && !integerAtLeast(show.year, 1))
      || (show.poster !== undefined && typeof show.poster !== 'string')) return false
    if ((show.genres !== undefined && (!Array.isArray(show.genres) || !show.genres.every((genre) => typeof genre === 'string')))
      || (show.review !== undefined && (typeof show.review !== 'string' || show.review.length > 200))) return false
    if (show.seasonEpisodes !== undefined && (!Array.isArray(show.seasonEpisodes)
      || !show.seasonEpisodes.every((season) => season !== null && typeof season === 'object'
        && integerAtLeast(season.season, 1) && integerAtLeast(season.episodes, 0)))) return false
    ids.add(show.id)
    return true
  })
}

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition active:scale-[0.98] ${
        active
          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs opacity-80">{value}</span>
    </button>
  )
}

function ShowSection({
  title,
  shows,
  emptyHint,
  onUpdateProgress,
  onNextEpisode,
  onUpdateDetails,
  onCompleteCurrentSeason,
  onWatchStatusChange,
  viewMode,
  onDelete,
  selecting,
  selectedIds,
  onSelectionChange,
}: {
  title: string
  shows: ReturnType<typeof useShows>['shows']
  emptyHint: string
  onUpdateProgress: (id: string, season: number, episode: number) => void
  onNextEpisode: (id: string) => void
  onUpdateDetails: (id: string, genres: string[], review: string) => void
  onCompleteCurrentSeason: (id: string) => void
  onWatchStatusChange: (id: string, status: WatchStatus) => void
  viewMode: 'grid' | 'list'
  onDelete: (id: string) => void
  selecting: boolean
  selectedIds: Set<string>
  onSelectionChange: (id: string, selected: boolean) => void
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-ink)]">{title}</h2>
        <span className="font-mono text-sm text-[var(--color-muted)]">{shows.length}</span>
      </div>
      {shows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-muted)]">
          {emptyHint}
        </p>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7' : 'grid grid-cols-1 gap-2'}>
          {shows.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              viewMode={viewMode}
              onUpdateProgress={onUpdateProgress}
              onNextEpisode={onNextEpisode}
              onUpdateDetails={onUpdateDetails}
              onCompleteCurrentSeason={onCompleteCurrentSeason}
              onWatchStatusChange={onWatchStatusChange}
              onDelete={onDelete}
              selecting={selecting}
              selected={selectedIds.has(show.id)}
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LibraryApp({ userId, email, onLogout }: { userId?: string; email?: string; onLogout?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ completed: number; total: number } | null>(null)
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null)
  const [watchFilter, setWatchFilter] = useState<WatchFilter>(() => savedPreference('my-shows-filter', ['all', 'watching', 'planned', 'completed', 'dropped'], 'all'))
  const [airingFilter, setAiringFilter] = useState<AiringStatus | 'all'>('all')
  const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => savedPreference('my-shows-sort', ['recent', 'name', 'progress'], 'recent'))
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => savedPreference('my-shows-view', ['grid', 'list'], 'grid'))
  const [libraryQuery, setLibraryQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<WatchStatus>('planned')
  const { theme, toggleTheme } = useTheme()
  const [moreFilters, setMoreFilters] = useState(false)
  const [notice, setNotice] = useState<{ message: string; restore?: () => void } | null>(null)
  const toolsRef = useRef<HTMLDetailsElement>(null)
  const {
    shows,
    stats,
    showsByStatus,
    addShow,
    nextEpisode,
    updateShow,
    completeCurrentSeason,
    importShows,
    hasTmdbId,
    setWatchStatus,
    removeShow,
    updateManyWatchStatus,
    removeManyShows,
    replaceShows,
    duplicateTmdbGroupCount,
    deduplicateTmdbShows,
    unlinkedCount,
    enrichMissingMetadata,
    cloudLoading,
    cloudReady,
    retrySync,
    syncState,
    syncError,
  } = useShows(userId)

  const countries = useMemo(() => [...new Set(shows.flatMap((show) =>
    show.country.split(/\s*\/\s*/).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [shows])
  const years = useMemo(() => [...new Set(shows.flatMap((show) => show.year ? [show.year] : []))]
    .sort((a, b) => b - a), [shows])
  const extraFilterCount = Number(airingFilter !== 'all') + Number(metadataFilter !== 'all')
    + Number(countryFilter !== 'all') + Number(yearFilter !== 'all') + Number(seasonFilter !== 'all')

  useEffect(() => {
    try {
      localStorage.setItem('my-shows-view', viewMode)
      localStorage.setItem('my-shows-sort', sortOrder)
      localStorage.setItem('my-shows-filter', watchFilter)
    } catch { /* The controls still work without persisted preferences. */ }
  }, [viewMode, sortOrder, watchFilter])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    function closeTools(event: PointerEvent) {
      if (!toolsRef.current?.contains(event.target as Node)) toolsRef.current?.removeAttribute('open')
    }
    function escapeTools(event: KeyboardEvent) {
      if (event.key === 'Escape' && toolsRef.current?.open) {
        toolsRef.current.removeAttribute('open')
        toolsRef.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeTools)
    document.addEventListener('keydown', escapeTools)
    return () => {
      document.removeEventListener('pointerdown', closeTools)
      document.removeEventListener('keydown', escapeTools)
    }
  }, [])

  const sections = useMemo(
    () => [
      { key: 'watching' as const, title: '正在观看', emptyHint: '还没有在追的剧，搜索添加后可将状态改为观看中' },
      { key: 'planned' as const, title: '待观看', emptyHint: '搜索 TMDB 添加想看的剧' },
      { key: 'completed' as const, title: '已看完', emptyHint: '看完的剧会出现在这里' },
      { key: 'dropped' as const, title: '已弃剧', emptyHint: '暂时没有已弃剧的记录' },
    ],
    [],
  )

  function filterAndSort(items: Show[]): Show[] {
    const normalizedQuery = libraryQuery.trim().toLocaleLowerCase()
    const filtered = items.filter((show) => {
      const matchesAiring = airingFilter === 'all' || show.status === airingFilter
      const completeMetadata = hasCompleteMetadata(show)
      const matchesMetadata = metadataFilter === 'all' || (metadataFilter === 'complete' ? completeMetadata : !completeMetadata)
      const matchesQuery =
        !normalizedQuery ||
        [show.name, show.englishName, show.country, ...(show.genres ?? []), show.review ?? ''].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        )
      const matchesCountry = countryFilter === 'all' || show.country.split(/\s*\/\s*/).includes(countryFilter)
      const matchesYear = yearFilter === 'all' || (yearFilter === 'unknown' ? !show.year : show.year === Number(yearFilter))
      const matchesSeasons = seasonFilter === 'all' || (seasonFilter === 'single' ? show.seasons === 1 : show.seasons > 1)
      return matchesAiring && matchesMetadata && matchesQuery && matchesCountry && matchesYear && matchesSeasons
    })
    return [...filtered].sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name, 'zh-CN')
      if (sortOrder === 'progress') {
        return a.currentSeason - b.currentSeason || a.currentEpisode - b.currentEpisode
      }
      return b.createdAt.localeCompare(a.createdAt)
    })
  }

  function chooseWatchFilter(filter: WatchFilter) {
    setWatchFilter(filter)
  }

  function changeRecord(id: string, action: () => void, message: string) {
    const previous = shows.find((show) => show.id === id)
    if (!previous) return
    action()
    setNotice({
      message: `${previous.name}：${message}`,
      restore: () => updateShow(id, {
        watchStatus: previous.watchStatus,
        currentSeason: previous.currentSeason,
        currentEpisode: previous.currentEpisode,
      }),
    })
  }

  function handleNextEpisode(id: string) {
    changeRecord(id, () => nextEpisode(id), '已更新观看进度')
  }

  function handleProgress(id: string, season: number, episode: number) {
    const previous = shows.find((show) => show.id === id)
    if (!previous) return
    const limit = previous.seasonEpisodes?.find((item) => item.season === season)?.episodes
      ?? (previous.seasons === 1 ? previous.episodes : undefined)
    const finalSeason = Math.max(previous.seasons, ...(previous.seasonEpisodes?.map((item) => item.season) ?? []))
    const rewound = season < previous.currentSeason || (season === previous.currentSeason && episode < previous.currentEpisode)
    const watchStatus: WatchStatus = previous.status === 'ended' && season >= finalSeason && limit && episode >= limit
      ? 'completed'
      : (previous.watchStatus === 'completed' && rewound) || (previous.watchStatus === 'planned' && episode > 0)
        ? 'watching' : previous.watchStatus
    changeRecord(id, () => updateShow(id, { currentSeason: season, currentEpisode: episode, watchStatus }), '已更新观看进度')
  }

  function handleSeasonComplete(id: string) {
    changeRecord(id, () => completeCurrentSeason(id), '已记录看完本季')
  }

  function handleStatus(id: string, status: WatchStatus) {
    changeRecord(id, () => setWatchStatus(id, status), '已更新观看状态')
  }

  function handleDetails(id: string, genres: string[], review: string) {
    updateShow(id, { genres, review })
    setNotice({ message: '已更新类别和短评' })
  }

  function toggleSelection(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function leaveSelectionMode() {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  function handleDelete(id: string) {
    if (window.confirm('确定删除这条剧集记录吗？此操作无法撤销。')) {
      setNotice(null)
      removeShow(id)
    }
  }

  function exportBackup() {
    const backup = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), shows }, null, 2)
    const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `my-shows-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result)) as unknown
        const restoredShows =
          typeof parsed === 'object' && parsed !== null && 'shows' in parsed
            ? (parsed as { shows: unknown }).shows
            : parsed
        if (!isShowBackup(restoredShows)) throw new Error('invalid backup')
        if (window.confirm(`恢复会替换当前 ${shows.length} 条记录，改为备份中的 ${restoredShows.length} 条。是否继续？`)) {
          setNotice(null)
          replaceShows(restoredShows)
          leaveSelectionMode()
        }
      } catch {
        window.alert('无法读取此备份文件，请选择由“导出备份”生成的 JSON 文件。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function applyBulkStatus() {
    if (selectedIds.size === 0) return
    setNotice(null)
    updateManyWatchStatus([...selectedIds], bulkStatus)
    leaveSelectionMode()
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return
    if (window.confirm(`确定删除选中的 ${selectedIds.size} 条记录吗？此操作无法撤销。`)) {
      setNotice(null)
      removeManyShows([...selectedIds])
      leaveSelectionMode()
    }
  }

  function deduplicate() {
    if (window.confirm(`检测到 ${duplicateTmdbGroupCount} 组重复剧集。将保留资料更完整的一条，并合并观看状态和进度。是否继续？`)) {
      setNotice(null)
      deduplicateTmdbShows()
    }
  }

  const visibleSections = sections
    .filter((section) => watchFilter === 'all' || section.key === watchFilter)
    .map((section) => ({ ...section, shows: filterAndSort(showsByStatus[section.key]) }))
  const visibleIds = visibleSections.flatMap((section) => section.shows.map((show) => show.id))
  const hasFilters = Boolean(libraryQuery.trim()) || extraFilterCount > 0
  const nonemptySections = visibleSections.filter((section) => section.shows.length > 0)

  function clearFilters() {
    setLibraryQuery('')
    setAiringFilter('all')
    setMetadataFilter('all')
    setCountryFilter('all')
    setYearFilter('all')
    setSeasonFilter('all')
    setWatchFilter('all')
  }

  function selectVisibleShows() {
    setSelecting(true)
    setSelectedIds(new Set(visibleIds))
  }

  function handleAddFromTmdb(preview: TmdbShowPreview) {
    addShow({
      tmdbId: preview.tmdbId,
      name: preview.name,
      englishName: preview.englishName,
      country: preview.country,
      year: preview.year,
      seasons: preview.seasons,
      episodes: preview.episodes,
      seasonEpisodes: preview.seasonEpisodes,
      status: preview.status,
      poster: preview.poster,
      genres: preview.genres ?? [],
      watchStatus: 'planned',
      currentSeason: 1,
      currentEpisode: 0,
    })
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === 'string') {
        const parsed = parseCsvToShows(text)
        if (parsed.length > 0) {
          importShows(parsed)
          setNotice({ message: `已读取 ${parsed.length} 条记录并合并到剧库` })
        } else {
          setNotice({ message: '没有读到有效记录，请检查 CSV 文件内容' })
        }
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleEnrichment() {
    if (unlinkedCount === 0) return

    setEnrichmentMessage(null)
    setEnrichmentProgress({ completed: 0, total: unlinkedCount })
    const result = await enrichMissingMetadata((completed, total) => {
      setEnrichmentProgress({ completed, total })
    })
    setEnrichmentProgress(null)
    setEnrichmentMessage(`已补全 ${result.updated} 部，${result.skipped} 部未能自动匹配`)
  }

  if (cloudLoading) {
    return <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10" aria-busy="true"><p role="status" className="mb-6 text-sm text-[var(--color-muted)]">正在读取云端剧库…</p><div className="mb-6 h-20 rounded-xl bg-[var(--color-border)] opacity-40" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{Array.from({ length: 7 }, (_, index) => <div key={index} className="aspect-[2/3] rounded-xl bg-[var(--color-border)] opacity-40" />)}</div></main>
  }

  if (userId && !cloudReady) {
    return <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-6"><h1 className="text-2xl font-semibold">暂时无法读取剧库</h1><p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{syncError ?? '请检查网络后重新读取。'}</p><div className="mt-6 flex gap-3"><button type="button" onClick={retrySync} className="rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-[var(--color-accent-contrast)]">重新读取</button>{onLogout && <button type="button" onClick={onLogout} className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm">退出登录</button>}</div></main>
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-10">
      <header className="relative z-20 border-b border-[var(--color-border)] py-3">
        <div className="flex h-11 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)]" aria-hidden="true"><TelevisionSimple size={24} weight="bold" /></div>
            <div>
              <h1 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-ink)]">My Shows</h1>
              <p className="hidden text-[11px] text-[var(--color-muted)] sm:block">你的观影角落</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {userId && (
              <div className="hidden items-center gap-2 text-xs text-[var(--color-muted)] sm:flex" role="status" title={syncError ?? undefined}>
                {syncState === 'saving' ? '正在同步…' : syncState === 'error' ? '有记录未同步' : '云端已同步'}
                {syncState === 'error' && <button type="button" onClick={retrySync} className="min-h-10 px-2 font-medium text-[var(--color-accent)]">重试</button>}
              </div>
            )}
            <details ref={toolsRef} className="relative" onClick={(event) => { if ((event.target as Element).closest('button')) toolsRef.current?.removeAttribute('open') }}>
              <summary aria-label="数据工具" className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-2 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98] sm:px-3">
                <DotsThree size={18} />
                <span className="hidden sm:inline">数据工具</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 shadow-[0_18px_45px_var(--color-shadow)]">
                <button type="button" onClick={handleEnrichment} disabled={enrichmentProgress !== null || unlinkedCount === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50">
                  {enrichmentProgress ? <Spinner size={17} className="animate-spin" /> : <ArrowsClockwise size={17} />}
                  {enrichmentProgress ? `补全中 ${enrichmentProgress.completed}/${enrichmentProgress.total}` : `补全资料 (${unlinkedCount})`}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"><UploadSimple size={17} />导入 CSV</button>
                <button type="button" onClick={exportBackup} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"><DownloadSimple size={17} />导出备份</button>
                <button type="button" onClick={() => restoreInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"><FileArrowUp size={17} />恢复备份</button>
              </div>
            </details>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98]"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {onLogout && (
              <button type="button" onClick={onLogout} title={email ? `退出 ${email}` : '退出登录'} aria-label="退出登录" className="rounded-xl p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-ink)] active:scale-[0.98]">
                <SignOut size={19} />
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleRestore}
          />
        </div>

      </header>

      <main id="show-library" className="scroll-mt-4">
        <section className="community-intro relative z-10 mt-5 grid gap-8 overflow-visible rounded-2xl border border-[var(--color-border)] px-6 py-9 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,0.7fr)] lg:items-center lg:px-10 lg:py-11">
          <div>
            <h2 className="max-w-xl text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-4xl">把看过的故事，留在这里。</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--color-muted)]">整理片单，接着上次的进度。慢慢形成属于你的观看档案。</p>
          </div>
          <div>
            <SearchBar onAdd={handleAddFromTmdb} isAdded={hasTmdbId} />
            <p className="mt-2 text-xs text-[var(--color-muted)]">发现一部剧，加入你的片单</p>
          </div>
        </section>

        <nav className="mt-5 flex gap-1.5 overflow-x-auto border-b border-[var(--color-border)] pb-4" aria-label="观看状态筛选">
          <StatCard label="全部" value={stats.total} active={watchFilter === 'all'} onClick={() => chooseWatchFilter('all')} />
          <StatCard label="正在观看" value={stats.watching} active={watchFilter === 'watching'} onClick={() => chooseWatchFilter('watching')} />
          <StatCard label="待观看" value={stats.planned} active={watchFilter === 'planned'} onClick={() => chooseWatchFilter('planned')} />
          <StatCard label="已看完" value={stats.completed} active={watchFilter === 'completed'} onClick={() => chooseWatchFilter('completed')} />
          <StatCard label="已弃剧" value={showsByStatus.dropped.length} active={watchFilter === 'dropped'} onClick={() => chooseWatchFilter('dropped')} />
        </nav>

        {enrichmentMessage && (
          <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">
            {enrichmentMessage}
          </p>
        )}
        {(syncState === 'error' || syncError) && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3" role="alert"><p className="text-sm text-[var(--color-danger)]">{syncError ?? '仍有记录尚未保存，请重试。'}</p>{syncState === 'error' && <button type="button" onClick={retrySync} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-[var(--color-accent)]">{userId ? '重新同步' : '重新保存'}</button>}</div>}

        <div className="library-toolbar mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
          <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-[var(--color-muted)]">
            查找库中剧集
            <span className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="剧名、国家、类别或短评"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            排序
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="recent">最近添加</option>
              <option value="name">剧名</option>
              <option value="progress">观看进度</option>
            </select>
          </label>
          <button type="button" onClick={() => setMoreFilters((value) => !value)} aria-expanded={moreFilters} aria-controls="library-filters" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"><SlidersHorizontal size={16} />{moreFilters ? '收起筛选' : '更多筛选'}{extraFilterCount > 0 && <span className="font-mono text-xs text-[var(--color-accent)]">{extraFilterCount}</span>}</button>
          </div>
          {moreFilters && <div id="library-filters" className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--color-muted)]">国家 / 地区<select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"><option value="all">全部国家 / 地区</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--color-muted)]">首播年份<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"><option value="all">全部年份</option>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}<option value="unknown">年份待补</option></select></label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--color-muted)]">季数<select value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value as SeasonFilter)} className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"><option value="all">全部季数</option><option value="single">单季剧集</option><option value="multiple">多季剧集</option></select></label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">播出状态<select value={airingFilter} onChange={(event) => setAiringFilter(event.target.value as AiringStatus | 'all')} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"><option value="all">全部</option><option value="ongoing">更新中</option><option value="ended">已完结</option></select></label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">资料完整度<select value={metadataFilter} onChange={(event) => setMetadataFilter(event.target.value as MetadataFilter)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"><option value="all">全部</option><option value="complete">资料完整</option><option value="incomplete">资料待补</option></select></label>
          </div>}
          {extraFilterCount > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="已应用筛选">
            {countryFilter !== 'all' && <button type="button" onClick={() => setCountryFilter('all')} aria-label={`移除国家筛选 ${countryFilter}`} className="filter-chip">{countryFilter}<X size={12} /></button>}
            {yearFilter !== 'all' && <button type="button" onClick={() => setYearFilter('all')} aria-label="移除年份筛选" className="filter-chip">{yearFilter === 'unknown' ? '年份待补' : `${yearFilter} 年`}<X size={12} /></button>}
            {seasonFilter !== 'all' && <button type="button" onClick={() => setSeasonFilter('all')} aria-label="移除季数筛选" className="filter-chip">{seasonFilter === 'single' ? '单季剧集' : '多季剧集'}<X size={12} /></button>}
            {airingFilter !== 'all' && <button type="button" onClick={() => setAiringFilter('all')} aria-label="移除播出状态筛选" className="filter-chip">{airingFilter === 'ongoing' ? '更新中' : '已完结'}<X size={12} /></button>}
            {metadataFilter !== 'all' && <button type="button" onClick={() => setMetadataFilter('all')} aria-label="移除资料完整度筛选" className="filter-chip">{metadataFilter === 'complete' ? '资料完整' : '资料待补'}<X size={12} /></button>}
          </div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3"><span className="text-xs text-[var(--color-muted)]">显示 {visibleIds.length} 部</span>{hasFilters && <button type="button" onClick={clearFilters} className="min-h-10 text-xs font-medium text-[var(--color-accent)]">清除筛选</button>}</div>
            <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5" aria-label="展示方式">
              <button type="button" onClick={() => setViewMode('grid')} className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-muted)]'}`} aria-label="卡片展示" aria-pressed={viewMode === 'grid'}><SquaresFour size={17} /></button>
              <button type="button" onClick={() => setViewMode('list')} className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-muted)]'}`} aria-label="列表展示" aria-pressed={viewMode === 'list'}><ListBullets size={17} /></button>
            </div>
            {selecting && visibleIds.length > 0 && (
              <button type="button" onClick={selectVisibleShows} className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]">选择当前结果 ({visibleIds.length})</button>
            )}
            <button
              type="button"
              onClick={() => (selecting ? leaveSelectionMode() : setSelecting(true))}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-[var(--color-surface)]"
            >
              {selecting ? '取消选择' : '批量管理'}
            </button>
            {duplicateTmdbGroupCount > 0 && (
              <button
                type="button"
                onClick={deduplicate}
                className="rounded-lg bg-[var(--color-accent-muted)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] transition active:scale-[0.98]"
              >
                合并重复 ({duplicateTmdbGroupCount})
              </button>
            )}
            </div>
          </div>
        </div>
        {selecting && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-accent-muted)] bg-[var(--color-accent-muted)] p-3 text-sm text-[var(--color-ink)]">
            <span>已选择 {selectedIds.size} 条</span>
            <select
              aria-label="批量观看状态"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as WatchStatus)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2"
            >
              <option value="watching">正在观看</option>
              <option value="planned">待看</option>
              <option value="completed">已看完</option>
              <option value="dropped">已弃剧</option>
            </select>
            <button type="button" onClick={applyBulkStatus} disabled={selectedIds.size === 0} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[var(--color-accent-contrast)] disabled:opacity-50">批量改状态</button>
            <button type="button" onClick={deleteSelected} disabled={selectedIds.size === 0} className="rounded-lg px-3 py-2 text-[var(--color-danger)] disabled:opacity-50">删除选中</button>
          </div>
        )}
        {visibleIds.length === 0 && <section className="mt-6 rounded-xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center"><h2 className="text-lg font-semibold">{hasFilters ? '没有符合条件的记录' : '这里还没有剧集'}</h2><p className="mt-2 text-sm text-[var(--color-muted)]">{hasFilters ? '试试其他关键词，或清除筛选看看全部剧集。' : watchFilter === 'all' ? '用上方的搜索框添加第一部想看的剧。' : visibleSections[0]?.emptyHint}</p>{(hasFilters || watchFilter !== 'all') && <button type="button" onClick={clearFilters} className="mt-4 min-h-10 rounded-lg px-4 text-sm font-medium text-[var(--color-accent)]">查看全部</button>}</section>}
        {nonemptySections.map((section) => (
            <ShowSection
              key={section.key}
              title={section.title}
              shows={section.shows}
              emptyHint={section.emptyHint}
              onUpdateProgress={handleProgress}
              onNextEpisode={handleNextEpisode}
              onUpdateDetails={handleDetails}
              onCompleteCurrentSeason={handleSeasonComplete}
              onWatchStatusChange={handleStatus}
              viewMode={viewMode}
              onDelete={handleDelete}
              selecting={selecting}
              selectedIds={selectedIds}
              onSelectionChange={toggleSelection}
            />
          ))}
        <footer className="mt-8 pb-6 text-xs text-[var(--color-muted)]"><a href="/beta.html" className="hover:text-[var(--color-accent)]">公开测试版 · 隐私说明与 TMDB 数据来源</a></footer>
      </main>
      {notice && <div className="fixed bottom-5 left-4 right-4 z-30 mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-3 shadow-[0_12px_35px_var(--color-shadow)]"><p className="min-w-0 flex-1 text-sm" role="status">{notice.message}</p>{notice.restore && <button type="button" onClick={() => { notice.restore?.(); setNotice({ message: '已撤销刚才的修改' }) }} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-[var(--color-accent)]"><ArrowCounterClockwise size={16} />撤销</button>}<button type="button" onClick={() => setNotice(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)]" aria-label="关闭提示"><X size={18} /></button></div>}
    </div>
  )
}

function App() {
  const auth = useAuth()

  if (auth.configured && auth.loading && !auth.session) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner size={22} className="animate-spin text-[var(--color-accent)]" /></div>
  }

  if (auth.configured && (!auth.session || auth.recovery)) {
    return <LoginScreen loading={auth.loading} error={auth.error} message={auth.message} recovery={auth.recovery} signup={auth.signup} onLeaveWaiting={auth.leaveWaiting} onAction={auth.accountAction} onLogin={auth.login} />
  }

  return <LibraryApp userId={auth.session?.user.id} email={auth.session?.user.email} onLogout={auth.configured ? auth.logout : undefined} />
}

export default App
