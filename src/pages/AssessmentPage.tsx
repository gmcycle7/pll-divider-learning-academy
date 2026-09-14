import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { DividerAnalysisWorksheet } from '@/components/lab/DividerAnalysisWorksheet'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { Callout, Section } from '@/components/content'
import { useLocalState } from '@/hooks/useProgress'
import { NotFound } from './NotFound'
import { johnson56 } from './assessment/models'
import { johnson56Schematic } from './assessment/schematics'
import { ASSESSMENT_A_META, AssessmentAIntro, AssessmentASolution, quizA, worksheetReferenceA } from './assessment/data-a'
import { ASSESSMENT_B_META, AssessmentBIntro, AssessmentBSolution, quizB } from './assessment/data-b'

/** localStorage['pdla.assessment.a' | 'pdla.assessment.b'] 的格式 */
export interface AssessmentResult {
  score: number
  total: number
  at: number
  /** Assessment A：交卷時工作紙已填的題數（0～15） */
  worksheetFilled?: number
}

export const WORKSHEET_KEY_A = 'assessment-a'

/** 讀工作紙已填題數（DividerAnalysisWorksheet 存在 pdla.worksheet.<storageKey>） */
export function countWorksheetFilled(storageKey: string): number {
  try {
    const raw = localStorage.getItem(`pdla.worksheet.${storageKey}`)
    if (!raw) return 0
    const obj = JSON.parse(raw) as Record<string, string>
    return Object.values(obj).filter((v) => (v ?? '').trim().length > 0).length
  } catch {
    return 0
  }
}

export function AssessmentPage() {
  const { which = '' } = useParams()
  if (which === 'a') return <AssessmentA />
  if (which === 'b') return <AssessmentB />
  return <NotFound />
}

/* ------------------------------------------------------------------ 共用：成績列 */
function ResultBanner({ result, passLine, worksheet }: { result: AssessmentResult | null; passLine: number; worksheet?: number }) {
  if (!result) return null
  const pct = result.total ? result.score / result.total : 0
  const pass = pct >= passLine
  return (
    <div className={`callout ${pass ? 'callout-idea' : 'callout-warning'}`} style={{ marginTop: '0.8em' }}>
      <div className="callout-title">{pass ? '通過' : '未通過'}</div>
      <div>
        分數 <b className="score" style={{ fontSize: '1.3rem' }}>{result.score} / {result.total}</b>（{Math.round(pct * 100)}%，及格線 {Math.round(passLine * 100)}%）　<span className="small muted">交卷時間：{new Date(result.at).toLocaleString()}</span>
        {worksheet !== undefined ? <span className="small muted">　工作紙：{worksheet}/15 已填</span> : null}
      </div>
    </div>
  )
}

function FlowChips({ items }: { items: { label: string; state: 'todo' | 'partial' | 'done'; note?: string }[] }) {
  return (
    <div className="control-row" style={{ gap: '0.5em', flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <span key={i} className={`chip ${it.state === 'done' ? 'chip-ok' : it.state === 'partial' ? 'chip-accent' : ''}`}>
          {i + 1}. {it.label}
          {it.note ? <span className="muted">　{it.note}</span> : null}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Assessment A */
function AssessmentA() {
  const [result, setResult] = useLocalState<AssessmentResult | null>('pdla.assessment.a', null)
  const [filled, setFilled] = useState(() => countWorksheetFilled(WORKSHEET_KEY_A))
  const [submittedNow, setSubmittedNow] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const solutionVisible = submittedNow || showSolution

  useEffect(() => {
    if (submittedNow) document.getElementById('assessment-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [submittedNow])

  const onComplete = (score: number, total: number) => {
    const f = countWorksheetFilled(WORKSHEET_KEY_A)
    setFilled(f)
    setResult({ score, total, at: Date.now(), worksheetFilled: f })
    setSubmittedNow(true)
  }

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">能力評估 A　／　Assessment A</div>
        <h1>{ASSESSMENT_A_META.title}</h1>
        <div className="en">{ASSESSMENT_A_META.titleEn}</div>
        <p className="muted">{ASSESSMENT_A_META.summary}</p>
        <FlowChips
          items={[
            { label: '讀電路', state: 'done' },
            { label: '逐 edge 模擬', state: 'partial' },
            { label: '工作紙', state: filled >= 15 ? 'done' : filled > 0 ? 'partial' : 'todo', note: `${filled}/15` },
            { label: '評量測驗', state: result ? 'done' : 'todo', note: result ? `${result.score}/${result.total}` : undefined },
            { label: '解答', state: solutionVisible ? 'done' : 'todo' },
          ]}
        />
        {result && !submittedNow ? (
          <div className="control-row" style={{ marginTop: '0.6em' }}>
            <span className="small muted">
              上次成績 {result.score}/{result.total}（{new Date(result.at).toLocaleString()}）。
            </span>
            <button className="btn btn-sm" onClick={() => setShowSolution((v) => !v)}>
              {showSolution ? '隱藏解答' : '顯示上次解鎖的解答'}
            </button>
          </div>
        ) : null}
      </header>

      <AssessmentAIntro />

      <Section title="逐 edge 推導" en="Step through the edges">
        <p>
          先在紙上推：reset 後 state = 000，mod = 0。第 1 個 edge 後？第 2 個？什麼時候回到 000？然後把 mod 切成 1 再推一次。推完再按模擬器對答案——注意這個模擬器<b>不顯示 next-state equation</b>，state table 只給你「結果」，equation 要你自己從電路讀。想測 illegal state 的話可以從任意 state 啟動。
        </p>
        <DividerSimPanel netlist={johnson56} schematic={johnson56Schematic} title="待分析電路（不顯示 equations）" showEquations={false} showDelayMode allowInitialState showPulseWidths />
        <Callout kind="method" title="推導時逼自己回答這幾個問題">
          <ol style={{ margin: 0 }}>
            <li>mod = 0 與 mod = 1 的 state 序列各是什麼？哪幾個 state 兩邊共用？</li>
            <li>div_out 在哪個 edge 0→1、哪個 edge 1→0？high 幾個 T？週期幾個 T？</li>
            <li>mod 在哪一個 state 才真的影響下一個 state？所以它最晚要在哪個 edge 前穩定？</li>
            <li>8 個 state 裡有幾個從 reset 到不了？到不了的 state 如果上電時剛好出現，會發生什麼事？兩種 mod 都試。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="分析工作紙" en="Worksheet">
        <p>15 題全部填完再交卷。交卷後這裡會顯示參考答案，你可以逐題對照自己的推導。</p>
        <DividerAnalysisWorksheet storageKey={WORKSHEET_KEY_A} circuitName="Assessment A：3-flop /5 /6 divider" reference={worksheetReferenceA} showReference={solutionVisible} onProgress={(f) => setFilled(f)} />
      </Section>

      <Section title="評量測驗" en="Assessment quiz" id="assessment-quiz">
        {filled < 15 ? (
          <Callout kind="note" title="建議先填完工作紙">
            工作紙還有 {15 - filled} 題沒填。測驗可以先做，但最終報告會同時看測驗分數與工作紙完成度。
          </Callout>
        ) : null}
        <QuizEngine title="Assessment A（10 題）" questions={quizA} storageKey="assessment-a" onComplete={onComplete} />
      </Section>

      <div id="assessment-result">
        <ResultBanner result={result} passLine={ASSESSMENT_A_META.passLine} worksheet={result?.worksheetFilled} />
      </div>

      {solutionVisible ? (
        <section id="solution" data-section="solution">
          <h2>完整解答</h2>
          <div className="solution-box">
            <AssessmentASolution />
          </div>
        </section>
      ) : (
        <Callout kind="note" title="解答尚未解鎖">
          交卷之後才會顯示完整解答（逐 edge 推導、state diagram、mod deadline、lock-up 分析）與工作紙參考答案。
        </Callout>
      )}

      <nav className="lesson-nav">
        <Link to="/lab" className="btn">
          ◀ 回 Reverse Engineering Lab
        </Link>
        <Link to="/assessment/b" className="btn btn-primary">
          Assessment B：找出 critical path ▶
        </Link>
      </nav>
    </article>
  )
}

/* ------------------------------------------------------------------ Assessment B */
function AssessmentB() {
  const [result, setResult] = useLocalState<AssessmentResult | null>('pdla.assessment.b', null)
  const [submittedNow, setSubmittedNow] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const solutionVisible = submittedNow || showSolution

  useEffect(() => {
    if (submittedNow) document.getElementById('assessment-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [submittedNow])

  const onComplete = (score: number, total: number) => {
    setResult({ score, total, at: Date.now() })
    setSubmittedNow(true)
  }

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">能力評估 B　／　Assessment B</div>
        <h1>{ASSESSMENT_B_META.title}</h1>
        <div className="en">{ASSESSMENT_B_META.titleEn}</div>
        <p className="muted">{ASSESSMENT_B_META.summary}</p>
        <FlowChips
          items={[
            { label: '讀電路與 delay 表', state: 'done' },
            { label: '列候選 path', state: 'partial' },
            { label: '評量測驗', state: result ? 'done' : 'todo', note: result ? `${result.score}/${result.total}` : undefined },
            { label: '解答（Critical Path Explorer）', state: solutionVisible ? 'done' : 'todo' },
          ]}
        />
        {result && !submittedNow ? (
          <div className="control-row" style={{ marginTop: '0.6em' }}>
            <span className="small muted">
              上次成績 {result.score}/{result.total}（{new Date(result.at).toLocaleString()}）。
            </span>
            <button className="btn btn-sm" onClick={() => setShowSolution((v) => !v)}>
              {showSolution ? '隱藏解答' : '顯示上次解鎖的解答'}
            </button>
          </div>
        ) : null}
      </header>

      <AssessmentBIntro />

      <Section title="評量測驗" en="Assessment quiz" id="assessment-quiz">
        <p className="small muted">數值題請填整數 ps。critical-path 題點選選項後，電路圖會高亮那條路徑，方便你確認 launch 與 capture 在哪裡。</p>
        <QuizEngine title="Assessment B（10 題）" questions={quizB} storageKey="assessment-b" onComplete={onComplete} />
      </Section>

      <div id="assessment-result">
        <ResultBanner result={result} passLine={ASSESSMENT_B_META.passLine} />
      </div>

      {solutionVisible ? (
        <section id="solution" data-section="solution">
          <h2>完整解答</h2>
          <div className="solution-box">
            <AssessmentBSolution />
          </div>
        </section>
      ) : (
        <Callout kind="note" title="解答尚未解鎖">
          交卷之後才會顯示 Critical Path Explorer（三種 mode）與逐條 path 的 arrival / required / slack 計算。
        </Callout>
      )}

      <nav className="lesson-nav">
        <Link to="/assessment/a" className="btn">
          ◀ Assessment A
        </Link>
        <Link to="/report" className="btn btn-primary">
          看最終報告 ▶
        </Link>
      </nav>
    </article>
  )
}
