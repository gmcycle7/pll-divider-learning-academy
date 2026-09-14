import { useMemo, useState } from 'react'
import type { QuizQuestion } from './types'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'

export interface QuizEngineProps {
  questions: QuizQuestion[]
  title?: string
  onComplete?: (score: number, total: number) => void
  storageKey?: string
}

type Answer = number | number[] | string | null

export function QuizEngine({ questions, title = '小測驗', onComplete, storageKey }: QuizEngineProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    if (!storageKey) return {}
    try {
      const raw = localStorage.getItem(`pdla.quiz.${storageKey}`)
      if (raw) return JSON.parse(raw) as Record<string, Answer>
    } catch {
      /* ignore */
    }
    return {}
  })
  const [submitted, setSubmitted] = useState(false)
  const set = (id: string, a: Answer) => setAnswers((p) => ({ ...p, [id]: a }))

  const results = useMemo(() => questions.map((q) => grade(q, answers[q.id] ?? null)), [questions, answers])
  const score = results.filter(Boolean).length
  const answeredAll = questions.every((q) => {
    const a = answers[q.id]
    return a !== null && a !== undefined && !(Array.isArray(a) && a.length === 0) && a !== ''
  })

  const submit = () => {
    setSubmitted(true)
    if (storageKey) {
      try {
        localStorage.setItem(`pdla.quiz.${storageKey}`, JSON.stringify(answers))
      } catch {
        /* ignore */
      }
    }
    onComplete?.(score, questions.length)
  }
  const retry = () => {
    setSubmitted(false)
    setAnswers({})
  }

  return (
    <div className="quiz">
      <h3 style={{ marginTop: 0 }}>
        {title} <span className="chip">{questions.length} 題</span>
      </h3>
      {questions.map((q, i) => (
        <div className="quiz-q" key={q.id}>
          <div className="q-head">
            <div>
              <span className="q-num">Q{i + 1}　</span>
              {q.prompt}
            </div>
            {submitted ? <span className={`chip ${results[i] ? 'chip-ok' : 'chip-danger'}`}>{results[i] ? '正確' : '錯誤'}</span> : null}
          </div>
          {q.context?.traces ? <ClockWaveform signals={q.context.traces} tEnd={q.context.tEnd ?? 1000} period={q.context.period} zoomable={false} measure={false} /> : null}
          {q.context?.schematic ? <LogicDiagram schematic={q.context.schematic} showValues={false} showLegend={false} /> : null}
          <QuestionBody q={q} value={answers[q.id] ?? null} onChange={(a) => set(q.id, a)} submitted={submitted} correct={results[i]} />
          {submitted ? (
            <div className={`quiz-expl ${results[i] ? 'ok' : 'bad'}`}>
              <b>解說：</b>
              {q.explanation}
            </div>
          ) : null}
        </div>
      ))}
      <div className="quiz-summary">
        {submitted ? (
          <>
            <span className="score">
              {score} / {questions.length}
            </span>
            <span className="muted">{score === questions.length ? '全對！' : score >= Math.ceil(questions.length * 0.6) ? '通過。看看錯的題目的解說。' : '再讀一次課文，特別是逐 edge 的部分，然後重做。'}</span>
            <button className="btn" onClick={retry}>
              重做
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={submit} disabled={!answeredAll}>
              交卷
            </button>
            {!answeredAll ? <span className="muted small">請先回答所有題目</span> : null}
          </>
        )}
      </div>
    </div>
  )
}

function QuestionBody({ q, value, onChange, submitted, correct }: { q: QuizQuestion; value: Answer; onChange: (a: Answer) => void; submitted: boolean; correct: boolean }) {
  switch (q.type) {
    case 'single':
      return (
        <ul className="quiz-opts">
          {q.options.map((o, i) => {
            const sel = value === i
            const cls = ['quiz-opt', sel ? 'selected' : '', submitted && i === q.answer ? 'correct' : '', submitted && sel && i !== q.answer ? 'wrong' : ''].filter(Boolean).join(' ')
            return (
              <li key={i} className={cls} onClick={() => !submitted && onChange(i)}>
                <input type="radio" checked={sel} readOnly />
                <span>{o}</span>
              </li>
            )
          })}
        </ul>
      )
    case 'multiple': {
      const arr = Array.isArray(value) ? value : []
      return (
        <ul className="quiz-opts">
          {q.options.map((o, i) => {
            const sel = arr.includes(i)
            const isAns = q.answers.includes(i)
            const cls = ['quiz-opt', sel ? 'selected' : '', submitted && isAns ? 'correct' : '', submitted && sel && !isAns ? 'wrong' : ''].filter(Boolean).join(' ')
            return (
              <li key={i} className={cls} onClick={() => !submitted && onChange(sel ? arr.filter((x) => x !== i) : [...arr, i])}>
                <input type="checkbox" checked={sel} readOnly />
                <span>{o}</span>
              </li>
            )
          })}
          <li className="small muted" style={{ listStyle: 'none' }}>
            （複選）
          </li>
        </ul>
      )
    }
    case 'numeric':
      return (
        <div className="control-row">
          <input type="number" step="any" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} disabled={submitted} />
          {q.unit ? <span className="muted">{q.unit}</span> : null}
          {submitted ? <span className={correct ? 'slack-ok' : 'slack-bad'}>正確答案：{q.answer}{q.unit ? ` ${q.unit}` : ''}</span> : null}
        </div>
      )
    case 'state':
      return (
        <div className="control-row">
          <span className="muted small">{q.bitNames ? q.bitNames.join(' ') : `${q.width} bits`}：</span>
          <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value.replace(/[^01]/g, '').slice(0, q.width))} disabled={submitted} placeholder={'0'.repeat(q.width)} />
          {submitted ? <span className={correct ? 'slack-ok' : 'slack-bad'}>正確答案：{q.answer}</span> : null}
        </div>
      )
    case 'waveform':
      return (
        <ul className="quiz-opts">
          {q.options.map((o, i) => {
            const sel = value === i
            const cls = ['quiz-opt', sel ? 'selected' : '', submitted && i === q.answer ? 'correct' : '', submitted && sel && i !== q.answer ? 'wrong' : ''].filter(Boolean).join(' ')
            return (
              <li key={i} className={cls} onClick={() => !submitted && onChange(i)} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div>
                  <input type="radio" checked={sel} readOnly /> {o.label}
                </div>
                <ClockWaveform signals={o.traces} tEnd={q.tEnd} period={q.period} zoomable={false} measure={false} compact rowHeight={26} showValuesAtCursor={false} />
              </li>
            )
          })}
        </ul>
      )
    case 'critical-path': {
      const idx = typeof value === 'number' ? value : -1
      return (
        <div>
          <LogicDiagram schematic={q.schematic} showValues={false} showLegend={false} highlights={idx >= 0 ? [q.options[idx].highlight] : []} />
          <ul className="quiz-opts">
            {q.options.map((o, i) => {
              const sel = value === i
              const cls = ['quiz-opt', sel ? 'selected' : '', submitted && i === q.answer ? 'correct' : '', submitted && sel && i !== q.answer ? 'wrong' : ''].filter(Boolean).join(' ')
              return (
                <li key={i} className={cls} onClick={() => !submitted && onChange(i)}>
                  <input type="radio" checked={sel} readOnly />
                  <span>
                    {o.label}
                    {o.description ? <span className="muted small">　{o.description}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )
    }
  }
}

export function grade(q: QuizQuestion, a: Answer): boolean {
  if (a === null || a === undefined) return false
  switch (q.type) {
    case 'single':
    case 'waveform':
    case 'critical-path':
      return a === q.answer
    case 'multiple': {
      if (!Array.isArray(a)) return false
      const s = [...a].sort().join(',')
      return s === [...q.answers].sort().join(',')
    }
    case 'numeric': {
      const n = Number(a)
      if (!Number.isFinite(n)) return false
      return Math.abs(n - q.answer) <= (q.tolerance ?? 1e-6)
    }
    case 'state':
      return typeof a === 'string' && a.padStart(q.width, '0') === q.answer
  }
}
