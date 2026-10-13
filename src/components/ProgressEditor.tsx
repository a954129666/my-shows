import { useId, useState } from 'react'
import type { Show } from '../types/show'
import { RecordDialog } from './RecordDialog'

interface ProgressEditorProps {
  show: Show
  onClose: () => void
  onSave: (season: number, episode: number) => void
}

export function ProgressEditor({ show, onClose, onSave }: ProgressEditorProps) {
  const [season, setSeason] = useState(String(show.currentSeason))
  const [episode, setEpisode] = useState(String(show.currentEpisode))
  const inputId = useId()
  const seasonLimit = Math.max(1, show.seasons, ...(show.seasonEpisodes?.map((item) => item.season) ?? []))
  const selectedSeason = Math.min(Math.max(1, Number(season) || 1), seasonLimit)
  const episodeLimit = show.seasonEpisodes?.find((item) => item.season === selectedSeason)?.episodes

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const ep = Math.min(Math.max(0, Math.trunc(Number(episode) || 0)), episodeLimit ?? Number.MAX_SAFE_INTEGER)
    onSave(Math.trunc(selectedSeason), ep)
  }

  return (
    <RecordDialog title="调整观看记录" description={show.name} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${inputId}-season`} className="text-sm font-medium text-[var(--color-ink)]">已看至第几季</label>
            <input
              id={`${inputId}-season`}
              data-dialog-initial-focus
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={seasonLimit}
              step={1}
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              aria-describedby={`${inputId}-season-help`}
              className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-muted)]"
            />
            <p id={`${inputId}-season-help`} className="text-xs text-[var(--color-muted)]">共 {seasonLimit} 季</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${inputId}-episode`} className="text-sm font-medium text-[var(--color-ink)]">已看至第几集</label>
            <input
              id={`${inputId}-episode`}
              type="number"
              inputMode="numeric"
              required
              min={0}
              max={episodeLimit}
              step={1}
              value={episode}
              onChange={(event) => setEpisode(event.target.value)}
              aria-describedby={`${inputId}-episode-help ${inputId}-progress-help`}
              className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-muted)]"
            />
            <p id={`${inputId}-episode-help`} className="text-xs text-[var(--color-muted)]">{episodeLimit == null ? '本季集数待补全' : `本季共 ${episodeLimit} 集`}</p>
          </div>
        </div>
        <p id={`${inputId}-progress-help`} className="text-xs leading-5 text-[var(--color-muted)]">填写最后看完的那一集。0 表示这一季尚未开始。</p>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 whitespace-nowrap rounded-lg border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface)] active:scale-[0.98]"
          >取消</button>
          <button
            type="submit"
            className="min-h-11 whitespace-nowrap rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-contrast)] transition hover:opacity-90 active:scale-[0.98]"
          >保存记录</button>
        </div>
      </form>
    </RecordDialog>
  )
}
