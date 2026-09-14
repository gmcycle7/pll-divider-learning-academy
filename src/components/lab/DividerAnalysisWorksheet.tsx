import { useMemo } from 'react'
import { useLocalState } from '@/hooks/useProgress'
import { WORKSHEET_QUESTIONS } from './worksheet'

export interface WorksheetProps {
  storageKey: string
  title?: string
  /** 參考答案（顯示解答時使用） */
  reference?: Record<string, string>
  showReference?: boolean
  onProgress?: (filled: number, total: number) => void
  circuitName?: string
}

export function DividerAnalysisWorksheet({ storageKey, title = '陌生 Divider 分析工作紙', reference, showReference = false, onProgress, circuitName }: WorksheetProps) {
  const [answers, setAnswers] = useLocalState<Record<string, string>>(`pdla.worksheet.${storageKey}`, {})
  const filled = useMemo(() => WORKSHEET_QUESTIONS.filter((q) => (answers[q.key] ?? '').trim().length > 0).length, [answers])
  const total = WORKSHEET_QUESTIONS.length
  const percent = Math.round((filled / total) * 100)
  const setAns = (k: string, v: string) => {
    const next = { ...answers, [k]: v }
    setAnswers(next)
    const f = WORKSHEET_QUESTIONS.filter((q) => (next[q.key] ?? '').trim().length > 0).length
    onProgress?.(f, total)
  }
  const exportMd = () => {
    const lines = [`# Divider 分析工作紙${circuitName ? `：${circuitName}` : ''}`, '']
    for (const q of WORKSHEET_QUESTIONS) {
      lines.push(`## ${q.label}`, '', (answers[q.key] ?? '').trim() || '（未填）', '')
      if (showReference && reference?.[q.key]) lines.push(`> 參考答案：${reference[q.key]}`, '')
    }
    return lines.join('\n')
  }
  const download = () => {
    const blob = new Blob([exportMd()], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `divider-worksheet-${storageKey}.md`
    a.click()
    URL.revokeObjectURL(url)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportMd())
      alert('已複製 Markdown 到剪貼簿')
    } catch {
      alert('無法存取剪貼簿，請使用下載')
    }
  }
  return (
    <div className="panel">
      <div className="panel-title">
        {title}
        <span className="chip">{filled}/{total} 已填</span>
      </div>
      <div className="progress-bar" style={{ marginBottom: '0.8em' }}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {WORKSHEET_QUESTIONS.map((q) => (
        <div key={q.key} className={`worksheet-item ${(answers[q.key] ?? '').trim() ? 'filled' : ''}`}>
          <label>
            {q.label} <span className="hint">— {q.hint}</span>
          </label>
          <textarea value={answers[q.key] ?? ''} onChange={(e) => setAns(q.key, e.target.value)} rows={2} />
          {showReference && reference?.[q.key] ? (
            <div className="small" style={{ marginTop: '0.2em' }}>
              <span className="chip chip-ok">參考答案</span> <span className="mono">{reference[q.key]}</span>
            </div>
          ) : null}
        </div>
      ))}
      <div className="control-row">
        <button className="btn" onClick={download}>
          匯出 Markdown
        </button>
        <button className="btn" onClick={copy}>
          複製為純文字
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm('清除這份工作紙的所有內容？')) setAnswers({})
          }}
        >
          清除
        </button>
      </div>
    </div>
  )
}
