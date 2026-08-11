import { useEffect, useRef, useState } from 'react'
import { MagnifyingGlass, Plus, Spinner } from '@phosphor-icons/react'
import type { TmdbShowPreview } from '../types/show'
import { searchTvShows } from '../utils/tmdb'
import { StatusTag } from './StatusTag'

interface SearchBarProps {
  onAdd: (preview: TmdbShowPreview) => void
  isAdded: (tmdbId: number) => boolean
}

export function SearchBar({ onAdd, isAdded }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbShowPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setOpen(true)

    try {
      const data = await searchTvShows(query)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleAdd(preview: TmdbShowPreview) {
    onAdd(preview)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSearch} className="flex gap-2">
        <label htmlFor="show-search" className="sr-only">
          搜索剧名
        </label>
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
          />
          <input
            id="show-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="请输入剧名，例如 Breaking Bad"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] py-3 pl-10 pr-4 text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-muted)]"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? <Spinner size={18} className="animate-spin" /> : '搜索'}
        </button>
      </form>

      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-lg">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">搜索中...</p>
          )}
          {error && <p className="px-4 py-4 text-sm text-rose-600">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
              没有找到相关剧集，请换一个剧名试试
            </p>
          )}
          {!loading &&
            results.map((item) => {
              const added = isAdded(item.tmdbId)
              return (
                <div
                  key={item.tmdbId}
                  className="flex gap-3 border-b border-[var(--color-border)] p-4 last:border-b-0"
                >
                  {item.poster ? (
                    <img
                      src={item.poster}
                      alt=""
                      className="h-24 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                      无海报
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-[var(--color-ink)]">{item.name}</h3>
                        <p className="text-sm text-[var(--color-muted)]">{item.englishName}</p>
                      </div>
                      <StatusTag kind="airing" value={item.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {item.country} · {item.year ?? '年份待补'} · {item.seasons}季 · {item.episodes}集
                    </p>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => handleAdd(item)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:bg-zinc-700"
                    >
                      {added ? (
                        '已在库中'
                      ) : (
                        <>
                          <Plus size={14} weight="bold" />
                          添加到我的剧库
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
