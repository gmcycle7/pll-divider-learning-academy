import { useEffect, useMemo, useState, type ReactNode } from 'react'
import katex from 'katex'
import { useExplainMode, type ExplainMode, MODE_LABEL, modeRank } from '@/hooks/useExplainMode'

// ---------------------------------------------------------------- Math
export function Math({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(children, { displayMode: block, throwOnError: false, strict: 'ignore' })
    } catch {
      return children
    }
  }, [children, block])
  return block ? <div className="katex-block" dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />
}

// ---------------------------------------------------------------- Term
export function Term({ zh, en }: { zh: string; en: string }) {
  return (
    <span className="term">
      {zh}
      <span className="term-en">（{en}）</span>
    </span>
  )
}

// ---------------------------------------------------------------- Section
export function Section({ id, title, children, en }: { id?: string; title: string; en?: string; children: ReactNode }) {
  const anchor = id ?? title.replace(/\s+/g, '-')
  return (
    <section id={anchor} data-section={anchor}>
      <h2>
        {title}
        {en ? <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>{en}</span> : null}
      </h2>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- Callout
export type CalloutKind = 'idea' | 'warning' | 'pitfall' | 'method' | 'formula' | 'note'
const CALLOUT_TITLE: Record<CalloutKind, string> = {
  idea: '直覺',
  warning: '注意',
  pitfall: '常見錯誤',
  method: '分析方法',
  formula: '公式',
  note: '補充',
}
export function Callout({ kind = 'note', title, children }: { kind?: CalloutKind; title?: string; children: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`}>
      <div className="callout-title">{title ?? CALLOUT_TITLE[kind]}</div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- Steps
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="steps">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- CodeBlock
export function CodeBlock({ code, lang = 'systemverilog', title, note }: { code: string; lang?: string; title?: string; note?: ReactNode }) {
  return (
    <div style={{ margin: '0.8em 0' }}>
      {title ? (
        <div className="small muted" style={{ marginBottom: '0.2em', display: 'flex', gap: '0.6em', alignItems: 'center' }}>
          <b style={{ color: 'var(--fg)' }}>{title}</b>
          <span className="chip">{lang}</span>
        </div>
      ) : null}
      <pre>
        <code>{code.trim()}</code>
      </pre>
      {note ? <div className="small muted">{note}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------- ModeContent
/** 依解說模式顯示內容：level 以上的模式才會展開；低於時顯示可展開的提示條 */
export function ModeContent({ level, title, children }: { level: Exclude<ExplainMode, 'beginner'>; title?: string; children: ReactNode }) {
  const { mode } = useExplainMode()
  const [open, setOpen] = useState(false)
  const visible = modeRank(mode) >= modeRank(level)
  useEffect(() => {
    if (visible) setOpen(false)
  }, [visible])
  if (visible || open) {
    return (
      <div className="mode-block">
        <div className="mode-block-head">
          <span>
            <span className={`chip ${level === 'deep' ? 'chip-danger' : 'chip-accent'}`}>{MODE_LABEL[level]}</span>
            {title ? <span style={{ marginLeft: '0.5em' }}>{title}</span> : null}
          </span>
          {!visible ? (
            <button className="btn btn-sm" onClick={() => setOpen(false)}>
              收合
            </button>
          ) : null}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="mode-block mode-block-collapsed">
      <div className="mode-block-head">
        <span>
          <span className={`chip ${level === 'deep' ? 'chip-danger' : 'chip-accent'}`}>{MODE_LABEL[level]}</span>
          <span style={{ marginLeft: '0.5em' }}>{title ?? '這一段屬於較深入的內容'}</span>
        </span>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          展開
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Tabs
export function Tabs({ tabs, initial = 0 }: { tabs: { label: string; content: ReactNode }[]; initial?: number }) {
  const [i, setI] = useState(initial)
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map((t, k) => (
          <button key={k} role="tab" aria-selected={i === k} className={i === k ? 'active' : ''} onClick={() => setI(k)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tabs[i]?.content}</div>
    </div>
  )
}

// ---------------------------------------------------------------- Bit value
export function BitVal({ v }: { v: 0 | 1 | 'X' | undefined }) {
  if (v === undefined || v === 'X') return <span className="value-x">X</span>
  return <span className={`value-${v}`}>{v}</span>
}

// ---------------------------------------------------------------- Compare table
export function CompareTable({ head, rows }: { head: string[]; rows: (ReactNode | string)[][] }) {
  return (
    <div className="scroll-x">
      <table className="compare-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Equations list
export function EquationList({ equations }: { equations: { target: string; text: string; latex?: string }[] }) {
  return (
    <div className="kv" style={{ margin: '0.5em 0' }}>
      {equations.map((eq) => (
        <div key={eq.target} style={{ display: 'contents' }}>
          <dt>{eq.target}</dt>
          <dd>{eq.latex ? <Math>{eq.latex}</Math> : eq.text}</dd>
        </div>
      ))}
    </div>
  )
}
