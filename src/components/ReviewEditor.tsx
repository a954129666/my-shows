import { useId, useState } from 'react'
import type { Show } from '../types/show'
import { RecordDialog } from './RecordDialog'

interface ReviewEditorProps {
  show: Show
  onClose: () => void
  onSave: (genres: string[], review: string) => void
}

export function ReviewEditor({ show, onClose, onSave }: ReviewEditorProps) {
  const inputId = useId()
  const [review, setReview] = useState(show.review ?? '')
  const [categories, setCategories] = useState((show.genres ?? []).join('、'))
  const [error, setError] = useState('')

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const genres = [...new Set(categories.split(/[,，、;；\n]/).map((value) => value.trim()).filter(Boolean))]
    if (genres.length > 8 || genres.some((genre) => genre.length > 32)) {
      setError('最多填写 8 个类别，每个类别不超过 32 个字符。')
      return
    }
    if (review.length > 200) {
      setError('短评最多填写 200 个字符。')
      return
    }
    onSave(genres, review.trim())
  }

  return (
    <RecordDialog title={show.review ? '编辑短评' : '写短评'} description={show.name} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${inputId}-review`} className="text-sm font-medium">简短评价</label>
          <textarea
            id={`${inputId}-review`}
            data-dialog-initial-focus
            rows={4}
            maxLength={200}
            value={review}
            onChange={(event) => { setReview(event.target.value); setError('') }}
            placeholder="记下一句话，留给下次回看。"
            aria-describedby={`${inputId}-review-help`}
            className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-sm leading-6 text-[var(--color-ink)] placeholder:text-[var(--color-muted)]"
          />
          <div id={`${inputId}-review-help`} className="flex justify-between gap-3 text-xs text-[var(--color-muted)]"><span>可以清空评价后保存。</span><span className="font-mono">{review.length}/200</span></div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${inputId}-genres`} className="text-sm font-medium">剧集类别</label>
          <input id={`${inputId}-genres`} value={categories} onChange={(event) => { setCategories(event.target.value); setError('') }} placeholder="例如：喜剧、悬疑、恐怖" aria-describedby={`${inputId}-genres-help`} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]" />
          <p id={`${inputId}-genres-help`} className="text-xs leading-5 text-[var(--color-muted)]">默认来自 TMDB，也可自行补充。多个类别用逗号或顿号分隔。</p>
        </div>
        {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm">取消</button>
          <button type="submit" className="min-h-11 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-accent-contrast)] active:scale-[0.98]">保存</button>
        </div>
      </form>
    </RecordDialog>
  )
}
