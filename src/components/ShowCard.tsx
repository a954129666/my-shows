import { useState } from 'react'
import { Check, PencilSimple, Trash } from '@phosphor-icons/react'
import type { Show, WatchStatus } from '../types/show'
import { formatProgress } from '../utils/csv'
import { ProgressEditor } from './ProgressEditor'
import { StatusTag } from './StatusTag'

interface ShowCardProps {
  show: Show
  viewMode: 'grid' | 'list'
  onUpdateProgress: (id: string, season: number, episode: number) => void
  onCompleteCurrentSeason: (id: string) => void
  onDelete: (id: string) => void
  selecting: boolean
  selected: boolean
  onSelectionChange: (id: string, selected: boolean) => void
  onWatchStatusChange: (id: string, status: WatchStatus) => void
}

export function ShowCard({
  show,
  viewMode,
  onUpdateProgress,
  onCompleteCurrentSeason,
  onDelete,
  selecting,
  selected,
  onSelectionChange,
  onWatchStatusChange,
}: ShowCardProps) {
  const [editing, setEditing] = useState(false)
  const metadataIncomplete = show.tmdbId <= 0 || !show.poster || !show.year || !show.seasonEpisodes?.length
  const canEditProgress = show.watchStatus !== 'completed'

  return (
    <>
      <article
        className={`group flex overflow-hidden rounded-xl border bg-[var(--color-surface-elevated)] transition-colors ${
          selected
            ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
        } ${viewMode === 'list' ? 'items-stretch' : 'min-h-40'}`}
      >
        <div className="relative shrink-0 bg-[var(--color-surface)]">
          {show.poster ? (
            <img
              src={show.poster}
              alt={`${show.name} 海报`}
              className={`h-full object-cover ${viewMode === 'list' ? 'w-20 sm:w-[5.5rem]' : 'w-28 sm:w-32'}`}
              loading="lazy"
            />
          ) : (
            <div className={`flex h-full min-h-32 items-center justify-center px-2 text-center text-[11px] text-[var(--color-muted)] ${viewMode === 'list' ? 'w-20 sm:w-[5.5rem]' : 'w-28 sm:w-32'}`}>
              暂无海报
            </div>
          )}
          {selecting && (
            <label className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] shadow-sm">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelectionChange(show.id, event.target.checked)}
                aria-label={`选择 ${show.name}`}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            </label>
          )}
        </div>

        <div className={`min-w-0 flex flex-1 ${viewMode === 'list' ? 'flex-col gap-2 p-3 sm:grid sm:grid-cols-[minmax(12rem,1fr)_auto_minmax(9rem,auto)] sm:items-center sm:gap-4' : 'flex-col p-3'}`}>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold leading-5 text-[var(--color-ink)]">{show.name}</h3>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{show.englishName}</p>
              </div>
              <StatusTag kind="airing" value={show.status} />
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
              <span>{show.country}</span>
              <span>{show.year ?? '年份待补'}</span>
              <span>{show.seasons}季 {show.episodes}集</span>
              {metadataIncomplete && <span className="text-amber-700 dark:text-amber-300">资料待补</span>}
            </div>

            {show.seasonEpisodes && show.seasonEpisodes.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-ink)]">查看每季集数</summary>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {show.seasonEpisodes.map((season) => (
                    <span key={season.season} className="rounded-md bg-[var(--color-surface)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-ink)]">
                      S{season.season} {season.episodes}集
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>

          {canEditProgress && (
            <div className={`${viewMode === 'list' ? 'sm:text-right' : 'mt-auto pt-3'}`}>
              <p className="text-[11px] text-[var(--color-muted)]">观看进度</p>
              <p className="font-mono text-sm font-semibold text-[var(--color-accent)]">{formatProgress(show.currentSeason, show.currentEpisode)}</p>
            </div>
          )}

          <div className={`flex min-w-0 items-center gap-1.5 ${viewMode === 'list' ? 'sm:justify-end' : 'mt-2'}`}>
            <select
              aria-label={`${show.name} 的观看状态`}
              value={show.watchStatus}
              onChange={(event) => onWatchStatusChange(show.id, event.target.value as WatchStatus)}
              className="w-24 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-medium text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="watching">正在观看</option>
              <option value="planned">待观看</option>
              <option value="completed">已看完</option>
              <option value="dropped">已弃剧</option>
            </select>

            {canEditProgress && (
              <button type="button" onClick={() => setEditing(true)} aria-label={`编辑 ${show.name} 的进度`} title="编辑进度" className="rounded-lg p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] active:scale-[0.98]">
                <PencilSimple size={16} />
              </button>
            )}
            {show.watchStatus === 'watching' && (
              <button type="button" onClick={() => onCompleteCurrentSeason(show.id)} aria-label={`${show.name} 看完本季`} title="看完本季" className="rounded-lg p-2 text-[var(--color-muted)] transition hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-accent)] active:scale-[0.98]">
                <Check size={16} weight="bold" />
              </button>
            )}
            <button type="button" onClick={() => onDelete(show.id)} aria-label={`删除 ${show.name}`} title="删除" className="rounded-lg p-2 text-[var(--color-muted)] transition hover:bg-rose-50 hover:text-rose-600 active:scale-[0.98] dark:hover:bg-rose-950">
              <Trash size={15} />
            </button>
          </div>
        </div>
      </article>

      {editing && (
        <ProgressEditor
          show={show}
          onClose={() => setEditing(false)}
          onSave={(season, episode) => {
            onUpdateProgress(show.id, season, episode)
            setEditing(false)
          }}
        />
      )}
    </>
  )
}
