import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { Show } from '../types/show'

interface ProgressEditorProps {
  show: Show
  onClose: () => void
  onSave: (season: number, episode: number) => void
}

export function ProgressEditor({ show, onClose, onSave }: ProgressEditorProps) {
  const [season, setSeason] = useState(String(show.currentSeason))
  const [episode, setEpisode] = useState(String(show.currentEpisode))
  const selectedSeason = Math.min(Math.max(1, Number(season) || 1), show.seasons)
  const episodeLimit = show.seasonEpisodes?.find((item) => item.season === selectedSeason)?.episodes

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const s = selectedSeason
    const ep = Math.min(Math.max(1, Number(episode) || 1), episodeLimit ?? Number.MAX_SAFE_INTEGER)
    onSave(s, ep)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-elevated)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="progress-editor-title"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="progress-editor-title" className="text-lg font-semibold text-[var(--color-ink)]">
            编辑进度
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--color-muted)] hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--color-muted)]">{show.name}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="season-input" className="text-sm font-medium text-[var(--color-ink)]">
                Season
              </label>
              <input
                id="season-input"
                type="number"
                min={1}
                max={show.seasons}
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-muted)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="episode-input"
                className="text-sm font-medium text-[var(--color-ink)]"
              >
                Episode
              </label>
              <input
                id="episode-input"
                type="number"
                min={1}
                max={episodeLimit}
                value={episode}
                onChange={(e) => setEpisode(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-muted)]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-medium text-white transition active:scale-[0.98]"
          >
            保存
          </button>
        </form>
      </div>
    </div>
  )
}
