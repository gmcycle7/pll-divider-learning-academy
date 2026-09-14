import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { modules } from '@/lessons/registry'
import { lessonStatus, useProgress, type LessonProgress, type ProgressMap } from '@/hooks/useProgress'
import { Callout, CompareTable } from '@/components/content'
import type { AssessmentResult } from './AssessmentPage'

/* ------------------------------------------------------------------ localStorage 讀取 */
type ModuleQuizMap = Record<string, { score: number; total: number; at: number }>

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return JSON.parse(raw) as T
  } catch {
    /* ignore */
  }
  return fallback
}

/** lab 完成判定：LabExercisePage 用 progress['lab-<id>'] 記錄；任一完成訊號都算 */
export function labDone(p?: LessonProgress): boolean {
  if (!p) return false
  if (p.exerciseDone || p.read) return true
  if (p.quizTotal && (p.quizScore ?? 0) >= Math.ceil(p.quizTotal * 0.6)) return true
  return false
}

/** 8 題 lab 的 id（見 src/lab/exercises；這裡只用字串比對，不 import lab 檔案） */
export const LAB_IDS = ['ex1-div2', 'ex2-ripple4', 'ex3-sync4', 'ex4-div3', 'ex5-dm23', 'ex6-mmd2', 'ex7-pmux8', 'ex8-pmux-nn1-dtc'] as const
const LAB_TOTAL = LAB_IDS.length

/* ------------------------------------------------------------------ 七項能力的映射規則 */
export interface AbilityDef {
  id: string
  zh: string
  en: string
  desc: string
  /** 哪些 module 的測驗（lesson quiz 與 module 總測驗的平均） */
  modules: number[]
  /** 哪些 lab（'all' = 全部 8 題） */
  labs: readonly string[] | 'all'
  assessment: 'a' | 'b' | null
  /** 權重（%） */
  w: { quiz: number; lab: number; assess: number }
  /** 分數最低時建議去哪一課 */
  next: { lesson: string; label: string }
}

export const ABILITIES: AbilityDef[] = [
  {
    id: 'state',
    zh: 'State 分析',
    en: 'State analysis',
    desc: '找 memory element、寫 next-state equation、從 reset 逐 edge 建 state table。',
    modules: [1, 2],
    labs: ['ex1-div2', 'ex2-ripple4', 'ex3-sync4', 'ex4-div3'],
    assessment: 'a',
    w: { quiz: 40, lab: 30, assess: 30 },
    next: { lesson: 'm1-l1-div2', label: 'Lesson 1-1 DFF Divide-by-2' },
  },
  {
    id: 'waveform',
    zh: '波形推理',
    en: 'Waveform reasoning',
    desc: '從 state 序列畫出波形、從波形反推 edge、duty、glitch 與 runt。',
    modules: [0, 2, 5],
    labs: ['ex2-ripple4', 'ex5-dm23', 'ex7-pmux8'],
    assessment: 'a',
    w: { quiz: 50, lab: 20, assess: 30 },
    next: { lesson: 'm0-l1-clock', label: 'Lesson 0-1 Clock 到底是什麼' },
  },
  {
    id: 'ratio',
    zh: 'Divide ratio 計算',
    en: 'Divide-ratio calculation',
    desc: '整數、dual-modulus、MMD 的 N 公式、fractional 的 average 與 instantaneous 除數。',
    modules: [3, 4, 6],
    labs: ['ex4-div3', 'ex5-dm23', 'ex6-mmd2', 'ex8-pmux-nn1-dtc'],
    assessment: 'a',
    w: { quiz: 50, lab: 25, assess: 25 },
    next: { lesson: 'm3-l1-dm-concept', label: 'Lesson 3-1 什麼是 /2 /3 Dual-Modulus Divider' },
  },
  {
    id: 'timing',
    zh: 'Timing 分析',
    en: 'Timing analysis',
    desc: 'arrival / required / slack、Tclk,min、setup vs hold vs pulse width、skew 與 jitter 的方向。',
    modules: [7],
    labs: [],
    assessment: 'b',
    w: { quiz: 50, lab: 0, assess: 50 },
    next: { lesson: 'm7-l1-cp-basics', label: 'Lesson 7-1 什麼是 Critical Path' },
  },
  {
    id: 'cp',
    zh: 'Critical path 辨識',
    en: 'Critical-path identification',
    desc: '從陌生電路找 launch / capture、判斷 sensitization 與 mode、分辨 Fmax / interface / recovery path。',
    modules: [4, 7],
    labs: 'all',
    assessment: 'b',
    w: { quiz: 40, lab: 20, assess: 40 },
    next: { lesson: 'm7-l2-cp-method', label: 'Lesson 7-2 如何從陌生電路找 Critical Path' },
  },
  {
    id: 'reset',
    zh: 'Reset / illegal state 分析',
    en: 'Reset and illegal-state analysis',
    desc: 'reachable / unused / lock-up state、self-recovering 設計、reset release 的 recovery / removal。',
    modules: [8],
    labs: ['ex4-div3', 'ex6-mmd2'],
    assessment: 'a',
    w: { quiz: 60, lab: 20, assess: 20 },
    next: { lesson: 'm8-l1-reset', label: 'Lesson 8-1 Divider 為什麼需要 Reset' },
  },
  {
    id: 'phase',
    zh: 'Phase continuity 分析',
    en: 'Phase-continuity analysis',
    desc: 'mode switching 時輸出相位是否連續、MOD deadline、PMUX safe window 與 runt。',
    modules: [3, 5],
    labs: ['ex5-dm23', 'ex6-mmd2', 'ex7-pmux8'],
    assessment: 'a',
    w: { quiz: 50, lab: 20, assess: 30 },
    next: { lesson: 'm3-l2-dm-cell', label: 'Lesson 3-2 /2 /3 Cell 的 State Analysis' },
  },
]

/* ------------------------------------------------------------------ 分數計算（純函式，方便理解與驗證） */
export interface AbilityScore {
  def: AbilityDef
  /** 0～1；資料不足的部分以 0 計 */
  score: number
  quizPct: number | null
  labDone: number
  labTotal: number
  assess: AssessmentResult | null
}

/** 某個 module 的測驗百分比：module 總測驗與各 lesson quiz 的平均（只算有作答的） */
export function moduleQuizPct(moduleId: number, progress: ProgressMap, moduleQuiz: ModuleQuizMap): number | null {
  const vals: number[] = []
  const mq = moduleQuiz[String(moduleId)]
  if (mq && mq.total > 0) vals.push(mq.score / mq.total)
  const mod = modules.find((m) => m.id === moduleId)
  for (const l of mod?.lessons ?? []) {
    const p = progress[l.id]
    if (p?.quizTotal) vals.push((p.quizScore ?? 0) / p.quizTotal)
  }
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export function scoreAbility(def: AbilityDef, progress: ProgressMap, moduleQuiz: ModuleQuizMap, assessA: AssessmentResult | null, assessB: AssessmentResult | null): AbilityScore {
  const quizVals = def.modules.map((m) => moduleQuizPct(m, progress, moduleQuiz)).filter((x): x is number => x !== null)
  const quizPct = quizVals.length ? quizVals.reduce((a, b) => a + b, 0) / quizVals.length : null
  const labList = def.labs === 'all' ? LAB_IDS : def.labs
  const labTotal = labList.length
  const done = labList.filter((id) => labDone(progress[`lab-${id}`])).length
  const assess = def.assessment === 'a' ? assessA : def.assessment === 'b' ? assessB : null
  const assessPct = assess && assess.total > 0 ? assess.score / assess.total : null
  const parts: { w: number; v: number }[] = [
    { w: def.w.quiz, v: quizPct ?? 0 },
    { w: labTotal ? def.w.lab : 0, v: labTotal ? done / labTotal : 0 },
    { w: def.assessment ? def.w.assess : 0, v: assessPct ?? 0 },
  ]
  const wsum = parts.reduce((a, p) => a + p.w, 0)
  const score = wsum ? parts.reduce((a, p) => a + p.w * p.v, 0) / wsum : 0
  return { def, score, quizPct, labDone: done, labTotal, assess }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/* ------------------------------------------------------------------ 頁面 */
export function ReportPage() {
  const { progress, reset } = useProgress()
  const [tick, setTick] = useState(0)
  const store = useMemo(
    () => ({
      moduleQuiz: readJSON<ModuleQuizMap>('pdla.moduleQuiz', {}),
      a: readJSON<AssessmentResult | null>('pdla.assessment.a', null),
      b: readJSON<AssessmentResult | null>('pdla.assessment.b', null),
    }),
    // tick 只是用來在 reset 之後強制重讀 localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, progress],
  )
  const abilities = useMemo(() => ABILITIES.map((d) => scoreAbility(d, progress, store.moduleQuiz, store.a, store.b)), [progress, store])
  const weakest = [...abilities].sort((x, y) => x.score - y.score)[0]
  const overall = abilities.reduce((a, s) => a + s.score, 0) / abilities.length

  const totalLessons = modules.reduce((a, m) => a + m.lessons.length, 0)
  const doneLessons = modules.reduce((a, m) => a + m.lessons.filter((l) => lessonStatus(progress[l.id]) === 'done').length, 0)
  const labKeys = Object.keys(progress).filter((k) => k.startsWith('lab-'))
  const labsDone = labKeys.filter((k) => labDone(progress[k])).length
  const moduleQuizTaken = modules.filter((m) => store.moduleQuiz[String(m.id)]).length

  const resetAll = () => {
    const ok = confirm('確定要重設所有進度？\n\n這會清除：課程進度（已讀／quiz／練習）、Module 總測驗成績、Assessment A / B 成績、所有測驗作答與分析工作紙。此動作無法復原。')
    if (!ok) return
    reset()
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) keys.push(k)
      }
      for (const k of keys) {
        if (k === 'pdla.moduleQuiz' || k.startsWith('pdla.assessment.') || k.startsWith('pdla.quiz.') || k.startsWith('pdla.worksheet.')) localStorage.removeItem(k)
      }
    } catch {
      /* ignore */
    }
    setTick((t) => t + 1)
  }

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">最終報告　／　Final report</div>
        <h1>七項能力報告</h1>
        <div className="en">Seven-skill competency report</div>
        <p className="muted">
          把所有課程測驗、Module 總測驗、Reverse Engineering Lab 與 Assessment A / B 的結果，映射成七項「分析陌生 divider」需要的能力。每一項的計算規則都寫在下面，沒有黑箱。
        </p>
        <div className="control-row">
          <span className="chip">
            課程 {doneLessons}/{totalLessons} 完成
          </span>
          <span className="chip">
            Module 總測驗 {moduleQuizTaken}/{modules.length}
          </span>
          <span className="chip">
            Lab {labsDone}/{LAB_TOTAL}
          </span>
          <span className={`chip ${store.a ? 'chip-ok' : ''}`}>Assessment A {store.a ? `${store.a.score}/${store.a.total}` : '未完成'}</span>
          <span className={`chip ${store.b ? 'chip-ok' : ''}`}>Assessment B {store.b ? `${store.b.score}/${store.b.total}` : '未完成'}</span>
          <span className="chip chip-accent">總平均 {pct(overall)}</span>
        </div>
      </header>

      <section>
        <h2>七項能力</h2>
        <div className="report-grid">
          {abilities.map((s) => (
            <div key={s.def.id} className="panel" style={{ margin: 0 }}>
              <div className="panel-title">
                {s.def.zh}
                <span className={`chip ${s.score >= 0.7 ? 'chip-ok' : s.score >= 0.4 ? 'chip-accent' : 'chip-danger'}`}>{pct(s.score)}</span>
              </div>
              <div className="small muted" style={{ marginBottom: '0.4em' }}>
                {s.def.en}
              </div>
              <div className="progress-bar" style={{ marginBottom: '0.6em' }}>
                <span style={{ width: `${Math.round(s.score * 100)}%` }} />
              </div>
              <div className="small">{s.def.desc}</div>
              <ul className="small" style={{ margin: '0.5em 0 0', paddingLeft: '1.2em' }}>
                <li>
                  Module {s.def.modules.join('、')} 測驗：{s.quizPct === null ? <span className="muted">尚無資料</span> : <b>{pct(s.quizPct)}</b>}　<span className="muted">權重 {s.def.w.quiz}%</span>
                </li>
                {s.labTotal ? (
                  <li>
                    Lab 完成：
                    <b>
                      {s.labDone}/{s.labTotal}
                    </b>
                    　<span className="muted">權重 {s.def.w.lab}%</span>
                  </li>
                ) : null}
                {s.def.assessment ? (
                  <li>
                    Assessment {s.def.assessment.toUpperCase()}：
                    {s.assess ? (
                      <b>
                        {s.assess.score}/{s.assess.total}
                      </b>
                    ) : (
                      <span className="muted">尚未完成</span>
                    )}
                    　<span className="muted">權重 {s.def.w.assess}%</span>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>建議下一步</h2>
        {weakest ? (
          <Callout kind="method" title={`最弱的能力：${weakest.def.zh}（${pct(weakest.score)}）`}>
            <p style={{ marginTop: 0 }}>{weakest.def.desc}</p>
            <div className="control-row">
              <Link to={`/lesson/${weakest.def.next.lesson}`} className="btn btn-primary">
                去讀 {weakest.def.next.label} ▶
              </Link>
              {weakest.def.modules.map((m) => (
                <Link key={m} to={`/module/${m}/quiz`} className="btn">
                  Module {m} 總測驗
                </Link>
              ))}
              {weakest.def.assessment ? (
                <Link to={`/assessment/${weakest.def.assessment}`} className="btn">
                  Assessment {weakest.def.assessment.toUpperCase()}
                </Link>
              ) : null}
              {weakest.labTotal && weakest.labDone < weakest.labTotal ? (
                <Link to="/lab" className="btn">
                  Lab（還有 {weakest.labTotal - weakest.labDone} 題）
                </Link>
              ) : null}
            </div>
          </Callout>
        ) : null}
        <p className="small muted">
          依序補強：
          {[...abilities]
            .sort((x, y) => x.score - y.score)
            .map((s) => `${s.def.zh} ${pct(s.score)}`)
            .join(' → ')}
        </p>
      </section>

      <section>
        <h2>計算規則</h2>
        <p className="small">
          每項能力 = Σ（權重 × 該項百分比）／ Σ 權重。「Module 測驗」= 該 module 總測驗與各 lesson 小測驗百分比的平均（只算有作答的；全部沒作答以 0 計並標示「尚無資料」）。「Lab 完成」= 該能力對應的 lab 題中已標記完成的比例（progress key <span className="mono">lab-&lt;id&gt;</span>）。「Assessment」= 交卷分數百分比。
        </p>
        <CompareTable
          head={['能力', 'Module 測驗（權重）', 'Lab（權重）', 'Assessment（權重）']}
          rows={ABILITIES.map((d) => [d.zh, `Module ${d.modules.join('、')}（${d.w.quiz}%）`, d.labs === 'all' ? `全部 8 題（${d.w.lab}%）` : d.labs.length ? `${d.labs.join('、')}（${d.w.lab}%）` : '—', d.assessment ? `${d.assessment.toUpperCase()}（${d.w.assess}%）` : '—'])}
        />
      </section>

      <section>
        <h2>各 Module 的 Lesson 完成狀態</h2>
        {modules.map((m) => {
          const mq = store.moduleQuiz[String(m.id)]
          return (
            <div key={m.id} className="panel">
              <div className="panel-title">
                Module {m.id}　{m.title}
                <span className={`chip ${mq ? 'chip-ok' : ''}`}>{mq ? `總測驗 ${mq.score}/${mq.total}` : '總測驗未作答'}</span>
              </div>
              <div className="scroll-x">
                <table className="state-table" style={{ fontFamily: 'var(--font)' }}>
                  <thead>
                    <tr>
                      <th>Lesson</th>
                      <th>狀態</th>
                      <th>已讀</th>
                      <th>小測驗</th>
                      <th>練習</th>
                      <th>最後更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.lessons.map((l) => {
                      const p = progress[l.id]
                      const st = lessonStatus(p)
                      return (
                        <tr key={l.id}>
                          <td>
                            <Link to={`/lesson/${l.id}`}>
                              {m.id}-{l.order} {l.title}
                            </Link>
                          </td>
                          <td>
                            <span className={`chip ${st === 'done' ? 'chip-ok' : st === 'partial' ? 'chip-accent' : ''}`}>{st === 'done' ? '完成' : st === 'partial' ? '進行中' : '未開始'}</span>
                          </td>
                          <td>{p?.read ? '✓' : '—'}</td>
                          <td>{p?.quizTotal ? `${p.quizScore ?? 0}/${p.quizTotal}` : '—'}</td>
                          <td>{p?.exerciseDone ? '✓' : '—'}</td>
                          <td className="small muted">{p?.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
        <div className="panel">
          <div className="panel-title">
            Module 9　Reverse Engineering Lab
            <span className="chip">
              {labsDone}/{LAB_TOTAL} 完成
            </span>
          </div>
          <div className="control-row">
            {LAB_IDS.map((id) => {
              const done = labDone(progress[`lab-${id}`])
              return (
                <Link key={id} to={`/lab/${id}`} className={`chip ${done ? 'chip-ok' : ''}`}>
                  {done ? '✓ ' : ''}
                  {id}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section>
        <h2>重設</h2>
        <p className="small muted">清除瀏覽器裡的所有學習紀錄（課程進度、Module 總測驗、Assessment、測驗作答、工作紙）。</p>
        <button className="btn" onClick={resetAll} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          重設所有進度
        </button>
      </section>
    </article>
  )
}
