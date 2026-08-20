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
} from '@phosphor-icons/react'
import { SearchBar } from './components/SearchBar'
import { ShowCard } from './components/ShowCard'
import { LoginScreen } from './components/LoginScreen'
import { useAuth } from './hooks/useAuth'
import { useShows } from './hooks/useShows'
import type { AiringStatus, Show, TmdbShowPreview, WatchStatus } from './types/show'
import { parseCsvToShows } from './utils/csv'

type WatchFilter = WatchStatus | 'all'
type SortOrder = 'recent' | 'name' | 'progress'
type MetadataFilter = 'all' | 'complete' | 'incomplete'

function hasCompleteMetadata(show: Show): boolean {
  return show.tmdbId > 0 && Boolean(show.poster && show.year && show.seasonEpisodes?.length)
}

function isShowBackup(value: unknown): value is Show[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Show).id === 'string' &&
        typeof (item as Show).name === 'string' &&
        typeof (item as Show).createdAt === 'string',
    )
  )
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
      className={`rounded-xl px-4 py-3 text-left transition active:scale-[0.98] ${
        active
          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
      }`}
    >
      <p className="text-[11px] font-medium text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-medium tracking-tight">{String(value).padStart(2, '0')}</p>
    </button>
  )
}

function ShowSection({
  title,
  shows,
  emptyHint,
  onUpdateProgress,
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
  onCompleteCurrentSeason: (id: string) => void
  onWatchStatusChange: (id: string, status: WatchStatus) => void
  viewMode: 'grid' | 'list'
  onDelete: (id: string) => void
  selecting: boolean
  selectedIds: Set<string>
  onSelectionChange: (id: string, selected: boolean) => void
}) {
  return (
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">{title}</h2>
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
  const [watchFilter, setWatchFilter] = useState<WatchFilter>('all')
  const [airingFilter, setAiringFilter] = useState<AiringStatus | 'all'>('all')
  const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<WatchStatus>('planned')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('my-shows-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const {
    shows,
    stats,
    showsByStatus,
    addShow,
    updateProgress,
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
    syncState,
    syncError,
  } = useShows(userId)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('my-shows-theme', theme)
  }, [theme])

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
        [show.name, show.englishName, show.country].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        )
      return matchesAiring && matchesMetadata && matchesQuery
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
    document.getElementById('show-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    if (window.confirm('确定删除这条剧集记录吗？此操作无法撤销。')) removeShow(id)
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
    updateManyWatchStatus([...selectedIds], bulkStatus)
    leaveSelectionMode()
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return
    if (window.confirm(`确定删除选中的 ${selectedIds.size} 条记录吗？此操作无法撤销。`)) {
      removeManyShows([...selectedIds])
      leaveSelectionMode()
    }
  }

  function deduplicate() {
    if (window.confirm(`检测到 ${duplicateTmdbGroupCount} 组重复剧集。将保留资料更完整的一条，并合并观看状态和进度。是否继续？`)) {
      deduplicateTmdbShows()
    }
  }

  const visibleSections = sections
    .filter((section) => watchFilter === 'all' || section.key === watchFilter)
    .map((section) => ({ ...section, shows: filterAndSort(showsByStatus[section.key]) }))
  const visibleIds = visibleSections.flatMap((section) => section.shows.map((show) => show.id))

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
      watchStatus: 'planned',
      currentSeason: 1,
      currentEpisode: 1,
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
        if (parsed.length > 0) importShows(parsed)
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
    return <div className="flex min-h-[100dvh] items-center justify-center gap-2 text-[var(--color-muted)]"><Spinner size={20} className="animate-spin" />正在读取云端剧库…</div>
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[1440px] px-4 pb-20 sm:px-6 lg:px-10">
      <header className="border-b border-[var(--color-border)] py-4 sm:py-5">
        <div className="flex h-12 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)] text-lg font-black text-white" aria-hidden="true">M</div>
            <div>
              <h1 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-ink)]">My Shows</h1>
              <p className="text-[11px] text-[var(--color-muted)]">你的观影角落</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {userId && (
              <div className="flex items-center rounded-lg bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-[var(--color-muted)] shadow-[inset_0_0_0_1px_var(--color-border)]" title={syncError ?? undefined}>
                {syncState === 'saving' ? '正在同步…' : syncState === 'error' ? '同步失败' : '云端已同步'}
              </div>
            )}
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-2 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98] sm:px-3">
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
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 text-[var(--color-muted)] transition hover:text-[var(--color-ink)] active:scale-[0.98]"
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

        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="总剧数" value={stats.total} active={watchFilter === 'all'} onClick={() => chooseWatchFilter('all')} />
          <StatCard label="观看中" value={stats.watching} active={watchFilter === 'watching'} onClick={() => chooseWatchFilter('watching')} />
          <StatCard label="已看完" value={stats.completed} active={watchFilter === 'completed'} onClick={() => chooseWatchFilter('completed')} />
          <StatCard label="待看" value={stats.planned} active={watchFilter === 'planned'} onClick={() => chooseWatchFilter('planned')} />
        </section>

        {enrichmentMessage && (
          <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">
            {enrichmentMessage}
          </p>
        )}
      {syncError && <p className="mt-3 text-sm text-rose-600" role="status">{syncError}</p>}

        <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(15rem,1fr)_auto_auto_auto_auto]">
          <label className="flex min-w-48 flex-col gap-1 text-xs text-[var(--color-muted)]">
            搜索我的剧库
            <span className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="剧名、英文名或国家"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            观看状态
            <select value={watchFilter} onChange={(event) => setWatchFilter(event.target.value as WatchFilter)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="all">全部</option>
              <option value="watching">正在观看</option>
              <option value="planned">待看</option>
              <option value="completed">已看完</option>
              <option value="dropped">已弃剧</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            播出状态
            <select value={airingFilter} onChange={(event) => setAiringFilter(event.target.value as AiringStatus | 'all')} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="all">全部</option>
              <option value="ongoing">更新中</option>
              <option value="ended">已完结</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            资料完整度
            <select value={metadataFilter} onChange={(event) => setMetadataFilter(event.target.value as MetadataFilter)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="all">全部</option>
              <option value="complete">资料完整</option>
              <option value="incomplete">资料待补</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            排序
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="recent">最近添加</option>
              <option value="name">剧名</option>
              <option value="progress">观看进度</option>
            </select>
          </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2">
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5" aria-label="展示方式">
              <button type="button" onClick={() => setViewMode('grid')} className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-muted)]'}`} aria-label="卡片展示" aria-pressed={viewMode === 'grid'}><SquaresFour size={17} /></button>
              <button type="button" onClick={() => setViewMode('list')} className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-[var(--color-surface-elevated)] text-[var(--color-accent)] shadow-sm' : 'text-[var(--color-muted)]'}`} aria-label="列表展示" aria-pressed={viewMode === 'list'}><ListBullets size={17} /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as WatchStatus)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2"
            >
              <option value="watching">正在观看</option>
              <option value="planned">待看</option>
              <option value="completed">已看完</option>
              <option value="dropped">已弃剧</option>
            </select>
            <button type="button" onClick={applyBulkStatus} disabled={selectedIds.size === 0} className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-white disabled:opacity-50">批量改状态</button>
            <button type="button" onClick={deleteSelected} disabled={selectedIds.size === 0} className="rounded-lg px-3 py-2 text-rose-700 disabled:opacity-50">删除选中</button>
          </div>
        )}
        {visibleSections.map((section) => (
            <ShowSection
              key={section.key}
              title={section.title}
              shows={section.shows}
              emptyHint={section.emptyHint}
              onUpdateProgress={updateProgress}
              onCompleteCurrentSeason={completeCurrentSeason}
              onWatchStatusChange={setWatchStatus}
              viewMode={viewMode}
              onDelete={handleDelete}
              selecting={selecting}
              selectedIds={selectedIds}
              onSelectionChange={toggleSelection}
            />
          ))}
      </main>
    </div>
  )
}

function App() {
  const auth = useAuth()

  if (auth.configured && auth.loading && !auth.session) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner size={22} className="animate-spin text-[var(--color-accent)]" /></div>
  }

  if (auth.configured && !auth.session) {
    return <LoginScreen loading={auth.loading} error={auth.error} onLogin={auth.login} />
  }

  return <LibraryApp userId={auth.session?.user.id} email={auth.session?.user.email} onLogout={auth.configured ? auth.logout : undefined} />
}

export default App
