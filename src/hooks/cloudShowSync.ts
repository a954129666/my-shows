import type { Show } from '../types/show'

export interface PendingShowDraft {
  version: 1
  userId: string
  changedShows: Show[]
  deletedIds: string[]
}

export interface CloudSyncSnapshot {
  shows: Show[]
  cloudReady: boolean
  cloudLoading: boolean
  syncState: 'saving' | 'saved' | 'error'
  syncError: string | null
}

interface DraftStorage {
  read(userId: string): PendingShowDraft | null
  write(userId: string, draft: PendingShowDraft | null): void
}

interface CloudSyncDependencies {
  fetch(): Promise<Show[]>
  upsert(shows: Show[], userId: string): Promise<void>
  remove(ids: string[]): Promise<void>
  storage: DraftStorage
  onChange(snapshot: CloudSyncSnapshot): void
  delay?: number
}

const DRAFT_KEY = 'my-shows-pending:'

function isStoredShow(value: unknown): value is Show {
  if (typeof value !== 'object' || value === null) return false
  const show = value as Partial<Show>
  return typeof show.id === 'string' && show.id.length > 0
    && typeof show.name === 'string' && typeof show.englishName === 'string'
    && typeof show.country === 'string' && typeof show.createdAt === 'string'
    && Number.isFinite(show.tmdbId) && Number.isFinite(show.seasons) && Number.isFinite(show.episodes)
    && Number.isFinite(show.currentSeason) && Number.isFinite(show.currentEpisode)
    && ['ended', 'ongoing'].includes(show.status ?? '')
    && ['watching', 'completed', 'planned', 'dropped'].includes(show.watchStatus ?? '')
    && (show.genres === undefined || (Array.isArray(show.genres) && show.genres.every((genre) => typeof genre === 'string')))
    && (show.review === undefined || (typeof show.review === 'string' && show.review.length <= 200))
}

export const pendingShowDraftStorage: DraftStorage = {
  read(userId) {
    const raw = localStorage.getItem(`${DRAFT_KEY}${encodeURIComponent(userId)}`)
    if (!raw) return null
    let draft: Partial<PendingShowDraft>
    try {
      draft = JSON.parse(raw) as Partial<PendingShowDraft>
    } catch {
      throw new Error('本机待同步记录无法读取，请先保留当前浏览器数据')
    }
    if (draft?.version !== 1 || draft.userId !== userId
      || !Array.isArray(draft.changedShows) || !draft.changedShows.every(isStoredShow)
      || !Array.isArray(draft.deletedIds) || !draft.deletedIds.every((id) => typeof id === 'string' && id.length > 0)) {
      throw new Error('本机待同步记录格式有误，请先保留当前浏览器数据')
    }
    return draft as PendingShowDraft
  },
  write(userId, draft) {
    const key = `${DRAFT_KEY}${encodeURIComponent(userId)}`
    if (draft) localStorage.setItem(key, JSON.stringify(draft))
    else localStorage.removeItem(key)
  },
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

/** One queue owns all writes, including exact-ID deletions and backup restores. */
export class CloudShowSync {
  private snapshot: CloudSyncSnapshot = {
    shows: [], cloudReady: false, cloudLoading: true, syncState: 'saving', syncError: null,
  }
  private changes = new Map<string, { show: Show; revision: number }>()
  private deletions = new Map<string, number>()
  private revision = 0
  private running = false
  private failed = false
  private disposed = false
  private readAttempt = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private draftDurable = true
  private storageWarning = false
  private readonly userId: string
  private readonly deps: CloudSyncDependencies

  constructor(userId: string, deps: CloudSyncDependencies) {
    this.userId = userId
    this.deps = deps
  }

  private publish(patch: Partial<CloudSyncSnapshot>) {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    this.deps.onChange(this.snapshot)
  }

  private hasPending() {
    return this.changes.size > 0 || this.deletions.size > 0
  }

  private persist() {
    const draft: PendingShowDraft | null = this.hasPending() ? {
      version: 1,
      userId: this.userId,
      changedShows: [...this.changes.values()].map((entry) => entry.show),
      deletedIds: [...this.deletions.keys()],
    } : null
    try {
      this.deps.storage.write(this.userId, draft)
      this.draftDurable = true
    } catch {
      this.draftDurable = false
      this.storageWarning = true
    }
  }

  async load() {
    if (this.disposed || this.snapshot.cloudReady) return
    const attempt = ++this.readAttempt
    this.publish({ cloudLoading: true, syncState: 'saving', syncError: null })
    try {
      const remote = await this.deps.fetch()
      if (this.disposed || attempt !== this.readAttempt) return
      // A cloud library starts with its own rows. Local-mode examples never enter it.
      const draft = this.deps.storage.read(this.userId)
      this.changes.clear()
      this.deletions.clear()
      if (draft) {
        for (const show of draft.changedShows) this.changes.set(show.id, { show, revision: ++this.revision })
        for (const id of draft.deletedIds) {
          this.changes.delete(id)
          this.deletions.set(id, ++this.revision)
        }
      }
      const merged = new Map(remote.map((show) => [show.id, show]))
      for (const [id, entry] of this.changes) merged.set(id, entry.show)
      for (const id of this.deletions.keys()) merged.delete(id)
      this.failed = this.hasPending()
      this.publish({
        shows: [...merged.values()], cloudReady: true, cloudLoading: false,
        syncState: this.failed ? 'error' : 'saved',
        syncError: this.failed ? '已恢复上次未同步的更改，请点击重新同步。' : null,
      })
    } catch (reason) {
      if (this.disposed || attempt !== this.readAttempt) return
      this.publish({
        shows: [], cloudLoading: false, cloudReady: false, syncState: 'error',
        syncError: errorMessage(reason, '无法读取云端数据'),
      })
    }
  }

  update(transform: (shows: Show[]) => Show[]) {
    if (this.disposed || !this.snapshot.cloudReady) return
    const previous = this.snapshot.shows
    const next = transform(previous)
    const previousById = new Map(previous.map((show) => [show.id, show]))
    const nextById = new Map(next.map((show) => [show.id, show]))
    let changed = false
    const revision = ++this.revision
    for (const show of next) {
      const existing = previousById.get(show.id)
      if (existing && JSON.stringify(existing) === JSON.stringify(show)) continue
      this.changes.set(show.id, { show, revision })
      this.deletions.delete(show.id)
      changed = true
    }
    for (const show of previous) {
      if (nextById.has(show.id)) continue
      this.changes.delete(show.id)
      this.deletions.set(show.id, revision)
      changed = true
    }
    if (!changed) return
    this.persist()
    this.publish({
      shows: next,
      syncState: this.failed ? 'error' : 'saving',
      syncError: this.failed
        ? (this.draftDurable ? '更改尚未同步，已保存在本机。请点击重新同步。' : '更改尚未同步，且无法保存在本机。请勿刷新，点击重新同步。')
        : (this.storageWarning ? '本机存储出现问题，正在尝试保存到云端。请勿刷新。' : null),
    })
    if (!this.failed && !this.running) {
      clearTimeout(this.timer)
      if (this.storageWarning) void this.flush()
      else this.timer = setTimeout(() => { void this.flush() }, this.deps.delay ?? 350)
    }
  }

  async retry() {
    if (this.disposed) return
    if (!this.snapshot.cloudReady) return this.load()
    this.failed = false
    clearTimeout(this.timer)
    return this.flush()
  }

  private async flush() {
    if (this.disposed || this.running || this.failed || !this.snapshot.cloudReady) return
    this.running = true
    this.publish({
      syncState: 'saving',
      syncError: this.storageWarning ? '本机存储出现问题，正在尝试保存到云端。请勿刷新。' : null,
    })
    try {
      while (this.hasPending() && !this.disposed) {
        const changes = new Map(this.changes)
        const deletions = new Map(this.deletions)
        // Upsert first: a failed restore must not erase the existing library.
        await this.deps.upsert([...changes.values()].map((entry) => entry.show), this.userId)
        if (this.disposed) return
        await this.deps.remove([...deletions.keys()])
        if (this.disposed) return
        for (const [id, entry] of changes) {
          if (this.changes.get(id)?.revision === entry.revision) this.changes.delete(id)
        }
        for (const [id, revision] of deletions) {
          if (this.deletions.get(id) === revision) this.deletions.delete(id)
        }
        this.persist()
      }
      this.persist()
      if (!this.draftDurable) {
        this.failed = true
        this.publish({ syncState: 'error', syncError: '云端已保存，但本机待同步记录未能清理。请勿刷新，点击重新同步。' })
      } else {
        this.storageWarning = false
        this.publish({ syncState: 'saved', syncError: null })
      }
    } catch (reason) {
      this.failed = true
      this.persist()
      const detail = this.draftDurable ? '更改已保存在本机，可重新同步。' : '更改仅保留在当前页面，请勿刷新。'
      this.publish({ syncState: 'error', syncError: `${errorMessage(reason, '云端保存失败')}。${detail}` })
    } finally {
      this.running = false
    }
  }

  dispose() {
    this.disposed = true
    this.readAttempt += 1
    clearTimeout(this.timer)
  }
}
