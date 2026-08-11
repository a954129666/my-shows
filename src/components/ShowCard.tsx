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

  return (
    <>
      <article
        className={`flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent-muted)] hover:shadow-sm ${
          viewMode === 'list' ? 'sm:items-center' : ''
        }`}
      >
        {show.poster ? (
          <img
            src={show.poster}
            alt={`${show.name} 海报`}
            className={`shrink-0 rounded-lg object-cover bg-[var(--color-surface)] ${
              viewMode === 'list' ? 'h-24 w-16' : 'h-40 w-[6.5rem]'
            }`}
            loading="lazy"
          />
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] px-2 text-center text-xs text-[var(--color-muted)] ${
              viewMode === 'list' ? 'h-24 w-16' : 'h-40 w-[6.5rem]'
            }`}
          >
            暂无海报
          </div>
        )}
        <div className={`min-w-0 flex flex-1 flex-col ${viewMode === 'list' ? 'sm:flex-row sm:items-center sm:gap-5' : ''}`}>
        <div className={`flex items-start justify-between gap-3 ${viewMode === 'list' ? 'sm:w-56 sm:shrink-0' : ''}`}>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-5 text-[var(--color-ink)]">{show.name}</h3>
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{show.englishName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selecting && (
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelectionChange(show.id, event.target.checked)}
                aria-label={`选择 ${show.name}`}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            )}
            <StatusTag kind="airing" value={show.status} />
          </div>
        </div>

        <dl className={`mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs ${viewMode === 'list' ? 'sm:mt-0 sm:w-52 sm:shrink-0' : ''}`}>
          <div>
            <dt className="text-[var(--color-muted)]">国家</dt>
            <dd className="font-medium text-[var(--color-ink)]">{show.country}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">首播</dt>
            <dd className="font-medium text-[var(--color-ink)]">{show.year ?? '待补充'}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">集数</dt>
            <dd className="font-medium text-[var(--color-ink)]">
              {show.seasons}季 {show.episodes}集
            </dd>
          </div>
        </dl>

        {show.seasonEpisodes && show.seasonEpisodes.length > 0 && (
          <details className={`mt-3 text-xs ${viewMode === 'list' ? 'sm:mt-0 sm:shrink-0' : ''}`}>
            <summary className="cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-ink)]">
              每季集数
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {show.seasonEpisodes.map((season) => (
                <span
                  key={season.season}
                  className="rounded-md bg-[var(--color-surface)] px-2 py-1 font-mono text-[var(--color-ink)]"
                >
                  S{season.season} {season.episodes}集
                </span>
              ))}
            </div>
          </details>
        )}

        {show.watchStatus !== 'completed' && (
          <div className={`mt-3 rounded-lg bg-[var(--color-accent-muted)] px-3 py-2 ${viewMode === 'list' ? 'sm:mt-0 sm:shrink-0' : ''}`}>
            <p className="text-xs text-[var(--color-muted)]">{show.watchStatus === 'watching' ? '当前进度' : '观看进度'}</p>
            <p className="font-mono font-semibold text-[var(--color-accent)]">
              {formatProgress(show.currentSeason, show.currentEpisode)}
            </p>
          </div>
        )}

        {show.watchStatus !== 'completed' && (
          <div className={`mt-3 flex flex-wrap gap-2 ${viewMode === 'list' ? 'sm:mt-0 sm:shrink-0' : ''}`}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <PencilSimple size={16} />
              编辑进度
            </button>
            {show.watchStatus === 'watching' && (
              <button
                type="button"
                onClick={() => onCompleteCurrentSeason(show.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] transition active:scale-[0.98] hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Check size={16} weight="bold" />
                看完本季
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(show.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs text-rose-600 transition active:scale-[0.98] hover:bg-rose-50 dark:hover:bg-rose-950"
            >
              <Trash size={13} />
              删除
            </button>
          </div>
        )}

        <div className={`mt-3 flex items-center justify-between gap-3 ${viewMode === 'list' ? 'sm:mt-0 sm:ml-auto sm:w-44 sm:shrink-0' : ''}`}>
          <select
            id={`status-${show.id}`}
            aria-label={`${show.name} 的观看状态`}
            value={show.watchStatus}
            onChange={(e) => onWatchStatusChange(show.id, e.target.value as WatchStatus)}
            className="w-full min-w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="watching">正在观看</option>
            <option value="planned">待观看</option>
            <option value="completed">已看完</option>
            <option value="dropped">已弃剧</option>
          </select>
          {show.watchStatus !== 'watching' && (
            <button
              type="button"
              onClick={() => onDelete(show.id)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950"
            >
              <Trash size={12} />
              删除
            </button>
          )}
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
