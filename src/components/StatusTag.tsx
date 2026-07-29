import type { AiringStatus, WatchStatus } from '../types/show'

interface StatusTagProps {
  kind: 'airing' | 'watch'
  value: AiringStatus | WatchStatus
}

const AIRING_LABELS: Record<AiringStatus, string> = {
  ended: '已完结',
  ongoing: '更新中',
}

const WATCH_LABELS: Record<WatchStatus, string> = {
  watching: '观看中',
  completed: '已看完',
  planned: '待观看',
  dropped: '已弃剧',
}

const AIRING_STYLES: Record<AiringStatus, string> = {
  ended: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  ongoing: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
}

const WATCH_STYLES: Record<WatchStatus, string> = {
  watching: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  completed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  planned: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  dropped: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

export function StatusTag({ kind, value }: StatusTagProps) {
  const label =
    kind === 'airing'
      ? AIRING_LABELS[value as AiringStatus]
      : WATCH_LABELS[value as WatchStatus]

  const style =
    kind === 'airing'
      ? AIRING_STYLES[value as AiringStatus]
      : WATCH_STYLES[value as WatchStatus]

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
