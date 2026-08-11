import { useMemo, useRef, useState } from 'react'
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
      className={`rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-accent-muted)]'
      }`}
    >
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
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
    <section className="mt-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-[var(--color-ink)]">{title}</h2>
        <span className="font-mono text-sm text-[var(--color-muted)]">{shows.length}</span>
      </div>
      {shows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-muted)]">
          {emptyHint}
        </p>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid grid-cols-1 gap-3'}>
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
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<WatchStatus>('planned')
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
      const matchesQuery =
        !normalizedQuery ||
        [show.name, show.englishName, show.country].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        )
      return matchesAiring && matchesQuery
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
    if (window.confirm(`检测到 ${duplicateTmdbGroupCount} 组重复剧集。将保留每组最早添加的一条记录，是否继续？`)) {
      deduplicateTmdbShows()
    }
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
    <div className="mx-auto min-h-[100dvh] max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-b border-[var(--color-border)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-4xl">
              我的影视库
            </h1>
            <p className="mt-2 text-[var(--color-muted)]">My Shows · 个人英美剧观看记录</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {userId && (
              <div className="flex items-center rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]" title={syncError ?? undefined}>
                {syncState === 'saving' ? '正在同步…' : syncState === 'error' ? '同步失败' : '云端已同步'}
              </div>
            )}
            <button
              type="button"
              onClick={handleEnrichment}
              disabled={enrichmentProgress !== null || unlinkedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enrichmentProgress ? <Spinner size={18} className="animate-spin" /> : <ArrowsClockwise size={18} />}
              {enrichmentProgress
                ? `补全中 ${enrichmentProgress.completed}/${enrichmentProgress.total}`
                : `补全信息与海报 (${unlinkedCount})`}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <UploadSimple size={18} />
              导入 CSV
            </button>
            <button
              type="button"
              onClick={exportBackup}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <DownloadSimple size={18} />
              导出备份
            </button>
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <FileArrowUp size={18} />
              恢复备份
            </button>
            {onLogout && (
              <button type="button" onClick={onLogout} title={email ? `退出 ${email}` : '退出登录'} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-muted)]">
                <SignOut size={18} />
                退出
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

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="总剧数" value={stats.total} active={watchFilter === 'all'} onClick={() => chooseWatchFilter('all')} />
          <StatCard label="观看中" value={stats.watching} active={watchFilter === 'watching'} onClick={() => chooseWatchFilter('watching')} />
          <StatCard label="已看完" value={stats.completed} active={watchFilter === 'completed'} onClick={() => chooseWatchFilter('completed')} />
          <StatCard label="待看" value={stats.planned} active={watchFilter === 'planned'} onClick={() => chooseWatchFilter('planned')} />
        </div>

        <div className="mt-6">
          <SearchBar onAdd={handleAddFromTmdb} isAdded={hasTmdbId} />
        </div>
        {enrichmentMessage && (
          <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">
            {enrichmentMessage}
          </p>
        )}
      </header>

      {syncError && <p className="mt-3 text-sm text-rose-600" role="status">{syncError}</p>}

      <main id="show-library" className="scroll-mt-4">
        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs text-[var(--color-muted)]">
            搜索我的剧库
            <span className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="剧名、英文名或国家"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-ink)]"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
            列表状态
            <select value={watchFilter} onChange={(event) => setWatchFilter(event.target.value as WatchFilter)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="all">全部</option>
              <option value="watching">正在观看</option>
              <option value="planned">待看</option>
              <option value="completed">已看完</option>
              <option value="dropped">已弃剧</option>
            </select>
          </label>
          <div className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
            展示方式
            <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
                aria-label="卡片展示"
                aria-pressed={viewMode === 'grid'}
              >
                <SquaresFour size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
                aria-label="列表展示"
                aria-pressed={viewMode === 'list'}
              >
                <ListBullets size={18} />
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
            播出状态
            <select value={airingFilter} onChange={(event) => setAiringFilter(event.target.value as AiringStatus | 'all')} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="all">全部</option>
              <option value="ongoing">更新中</option>
              <option value="ended">已完结</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
            排序
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
              <option value="recent">最近添加</option>
              <option value="name">剧名</option>
              <option value="progress">观看进度</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 self-end">
            <button
              type="button"
              onClick={() => (selecting ? leaveSelectionMode() : setSelecting(true))}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {selecting ? '取消选择' : '批量管理'}
            </button>
            {duplicateTmdbGroupCount > 0 && (
              <button
                type="button"
                onClick={deduplicate}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                清理重复 ({duplicateTmdbGroupCount})
              </button>
            )}
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
        {sections
          .filter((section) => watchFilter === 'all' || section.key === watchFilter)
          .map((section) => (
            <ShowSection
              key={section.key}
              title={section.title}
              shows={filterAndSort(showsByStatus[section.key])}
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
