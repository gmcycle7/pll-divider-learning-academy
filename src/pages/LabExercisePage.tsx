import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { LabExercise } from '@/lab/types'
import type { Netlist, StepRecord } from '@/models/divider/types'
import { exercises, findExercise, prevNextExercise } from '@/lab/exercises'
import { useLocalState, useProgress } from '@/hooks/useProgress'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { StateTable } from '@/components/sim/StateTable'
import { DividerAnalysisWorksheet } from '@/components/lab/DividerAnalysisWorksheet'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { Callout } from '@/components/content'
import { simulate } from '@/models/divider/engine'
import { toBitString } from '@/utils/bits'
import { fmtT } from '@/utils/format'
import { clampHint, difficultyStars, edgesForTwoOutputPeriods, HINT_DESC, HINT_TITLES, labProgressKey, WORKSHEET_TOTAL, worksheetFilledCount, type HintLevel } from '@/lab/hints'
import { NotFound } from './NotFound'

export function LabExercisePage() {
  const { exerciseId = '' } = useParams()
  const exercise = findExercise(exerciseId)
  if (!exercise) return <NotFound />
  // key = id：切換題目時所有本頁 state（hint 展開、表格開關…）重新初始化
  return <ExerciseView key={exercise.id} exercise={exercise} />
}

function ExerciseView({ exercise: ex }: { exercise: LabExercise }) {
  const { progress, update } = useProgress()
  const key = labProgressKey(ex.id)
  const p = progress[key]
  const hintLevel: HintLevel = clampHint(p?.hintsUsed)
  const [showSolution, setShowSolution] = useLocalState<boolean>(`pdla.lab.${ex.id}.solution`, false)
  const [showValues, setShowValues] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [filled, setFilled] = useState(() => worksheetFilledCount(ex.id))
  const { prev, next } = prevNextExercise(ex.id)
  const period = ex.simOptions?.period ?? 100

  // Hint 3：用 simulate 產生涵蓋兩個 output 週期的逐 edge 表
  const hint3 = useMemo(() => {
    const k = edgesForTwoOutputPeriods(ex.netlist, ex.simOptions)
    const { records } = simulate(ex.netlist, k, { ...ex.simOptions, period })
    return { k, records }
  }, [ex, period])

  const unlockHint = (n: HintLevel) => {
    if (n !== hintLevel + 1) return
    update(key, { hintsUsed: n })
  }
  const revealSolution = () => {
    if (showSolution) return
    const ok = window.confirm(`確定要顯示題目 ${ex.order} 的完整解答嗎？\n\n建議先把工作紙 15 題都填完（目前 ${filled}/${WORKSHEET_TOTAL}），並用模擬器逐 edge 驗證過。顯示解答後，工作紙每一題下方會出現參考答案。`)
    if (ok) setShowSolution(true)
  }

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">
          Module 9　Reverse Engineering Lab　／　題目 {ex.order} / {exercises.length}
        </div>
        <h1>{ex.title}</h1>
        <div className="control-row" style={{ margin: '0.3em 0' }}>
          <span className="chip" title={`難度 ${ex.difficulty}/5`} style={{ color: 'var(--warn)', letterSpacing: '0.05em' }}>
            {difficultyStars(ex.difficulty)}
          </span>
          <span className={`chip ${filled === WORKSHEET_TOTAL ? 'chip-ok' : ''}`}>
            工作紙 {filled}/{WORKSHEET_TOTAL}
          </span>
          <span className={`chip ${hintLevel > 0 ? 'chip-warn' : ''}`}>Hint 已用 {hintLevel}/3</span>
          {p?.exerciseDone ? <span className="chip chip-ok">已完成</span> : null}
          <Link to="/lab" className="small">
            ◀ 回 Lab 總覽
          </Link>
        </div>
        <p className="muted">{ex.summary}</p>
      </header>

      {/* 1. 題幹與 schematic */}
      <section id="problem" data-section="problem">
        <h2>
          題目
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>The circuit</span>
        </h2>
        {ex.Prompt ? <ex.Prompt /> : null}
        <div className="control-row">
          <label className="toggle">
            <input type="checkbox" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
            在電路圖上顯示 reset 後的初始值（建議先自己推）
          </label>
        </div>
        <LogicDiagram schematic={ex.schematic} values={showValues ? initialValues(ex.netlist) : undefined} showValues={showValues} caption="元件只標 U1、U2…，走線只標 n1、n2…。滑鼠移到元件上可看元件種類與觸發 edge，但不會告訴你它在電路裡扮演什麼角色。" />
      </section>

      {/* 2. 互動模擬 */}
      <section id="sim" data-section="sim">
        <h2>
          逐 edge 驗證
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>Step the clock yourself</span>
        </h2>
        <p className="small muted">
          這是你「用手推」的工具：每按一次「下一個 Clock Edge」，只會告訴你 edge 前後的 state 與 output，不會顯示 next-state equation。先在紙上寫下你預期的下一個 state，再按下去比對。切到「實際 delay」可以看到 tCQ 與 gate delay 在波形上的位置。
        </p>
        <div className="control-row">
          <label className="toggle">
            <input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} />
            顯示逐 edge state table（含 D 值——推完再開）
          </label>
        </div>
        <DividerSimPanel
          netlist={ex.netlist}
          schematic={ex.schematic}
          options={ex.simOptions}
          title={<>模擬器：題目 {ex.order}</>}
          showEquations={false}
          showNarration
          narrate={(rec, nl, T) => <PlainNarration rec={rec} netlist={nl} period={T} />}
          showTable={showTable}
          showMeasure={false}
          showDelayMode
          showInputs
          showPulseWidths
        />
      </section>

      {/* 3. 工作紙 */}
      <section id="worksheet" data-section="worksheet">
        <h2>
          分析工作紙
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>15-question worksheet</span>
        </h2>
        <DividerAnalysisWorksheet storageKey={ex.id} title={`工作紙：題目 ${ex.order}`} circuitName={`題目 ${ex.order}：${ex.title}`} reference={ex.reference} showReference={showSolution} onProgress={(f) => setFilled(f)} />
      </section>

      {/* 4. 三級提示 */}
      <section id="hints" data-section="hints">
        <h2>
          提示
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>Three-level hints</span>
        </h2>
        <p className="small muted">提示必須依序解鎖（先 1、再 2、再 3），每解鎖一個都會記錄到你的進度。解答前先試著只用 Hint 1。</p>
        {([0, 1, 2] as const).map((i) => {
          const n = (i + 1) as HintLevel
          const unlocked = hintLevel >= n
          const isNext = hintLevel === i
          return (
            <div key={i} className="hint-box" style={{ opacity: unlocked || isNext ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1em', flexWrap: 'wrap' }}>
                <b>{HINT_TITLES[i]}</b>
                {unlocked ? (
                  <span className="chip chip-warn">已解鎖</span>
                ) : isNext ? (
                  <button className="btn btn-sm" onClick={() => unlockHint(n)}>
                    解鎖 Hint {n}（會記錄）
                  </button>
                ) : (
                  <span className="chip">先解鎖 Hint {i}</span>
                )}
              </div>
              {!unlocked ? <div className="small muted" style={{ marginTop: '0.3em' }}>{HINT_DESC[i]}</div> : null}
              {unlocked ? (
                <div style={{ marginTop: '0.5em' }}>
                  <p style={{ margin: '0 0 0.4em' }}>{ex.hints[i]}</p>
                  {i === 2 ? (
                    <>
                      <div className="small muted" style={{ marginBottom: '0.3em' }}>
                        模擬器從 reset 跑 {hint3.k} 個 edge（T = {period} ps，ideal delay），涵蓋第一個 output rising edge 之後兩個完整的 output 週期：
                      </div>
                      <StateTable netlist={ex.netlist} records={hint3.records} period={period} maxRows={hint3.k} currentIndex={-1} />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </section>

      {/* 5. 完整解答 */}
      <section id="solution" data-section="solution">
        <h2>
          完整解答
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>Full solution</span>
        </h2>
        {!showSolution ? (
          <div className="panel">
            <p style={{ marginTop: 0 }}>
              解答包含：逐 edge 說明、state table 與 state diagram、除數與 duty 推導、critical path scenario（可互動改 T / skew / jitter）、工作紙 15 題參考答案，以及自我檢查題。
            </p>
            <div className="control-row">
              <button className="btn btn-primary" onClick={revealSolution}>
                顯示完整解答（需確認）
              </button>
              <span className="small muted">
                目前工作紙 {filled}/{WORKSHEET_TOTAL}，Hint 已用 {hintLevel}/3。
              </span>
            </div>
          </div>
        ) : (
          <>
            <Callout kind="note" title="對答案的方法">
              先回到上面的工作紙：每一題下方現在都有參考答案。逐題比對你寫的和參考答案差在哪裡——尤其是第 6、7、9、10、12～14 題——再往下讀解答。
            </Callout>
            <div className="solution-box">
              <ex.Solution />
            </div>
            {ex.criticalPath ? (
              <>
                <h3>Critical path scenario</h3>
                <p className="small muted">點選候選路徑比較 slack；把 T 調小到 slack = 0 就是 Tclk,min。切到 Hold 分頁看 min-delay 檢查。</p>
                <CriticalPathExplorer scenario={ex.criticalPath} guided />
              </>
            ) : null}
            <div className="control-row" style={{ marginTop: '1em' }}>
              <label className="toggle">
                <input type="checkbox" checked={!!p?.exerciseDone} onChange={(e) => update(key, { exerciseDone: e.target.checked })} />
                我已完成這一題（工作紙填完、解答看完）
              </label>
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (window.confirm('隱藏解答與參考答案？（你的工作紙內容與進度會保留）')) setShowSolution(false)
                }}
              >
                隱藏解答
              </button>
            </div>
          </>
        )}
      </section>

      {/* 6. 導覽 */}
      <nav className="lesson-nav">
        {prev ? (
          <Link to={`/lab/${prev.id}`} className="btn">
            ◀ 題目 {prev.order}：{prev.title}
          </Link>
        ) : (
          <Link to="/lab" className="btn">
            ◀ Lab 總覽
          </Link>
        )}
        {next ? (
          <Link to={`/lab/${next.id}`} className="btn btn-primary">
            題目 {next.order}：{next.title} ▶
          </Link>
        ) : (
          <Link to="/report" className="btn btn-primary">
            全部做完了，前往最終報告 ▶
          </Link>
        )}
      </nav>
    </article>
  )
}

/** reset 釋放後、尚未有任何 edge 時的訊號值（用 simulate 0 步取得） */
function initialValues(netlist: Netlist) {
  return simulate(netlist, 0).sim.getValues()
}

/** 簡化版敘述：只講 edge 前後的 state 與 output，不列出 combinational / D 值 */
function PlainNarration({ rec, netlist, period }: { rec: StepRecord; netlist: Netlist; period: number }): ReactNode {
  const before = toBitString(rec.stateBefore, netlist.stateOrder)
  const after = toBitString(rec.stateAfter, netlist.stateOrder)
  const inputs = netlist.inputs.map((i) => `${i.name}=${rec.inputs[i.name]}`).join('，')
  return (
    <div>
      <b>Edge {rec.edgeIndex}</b>（t = {fmtT(rec.t, period)}，{rec.edge}）：edge 前 state = <span className="mono">{before}</span>
      {inputs ? <>，input：<span className="mono">{inputs}</span></> : null}
      　→　edge 後 state = <span className="mono">{after}</span>
      {before === after ? '（沒有變化）' : ''}，output {netlist.output} = <b className={`value-${rec.output}`}>{rec.output}</b>。
      <div className="small muted" style={{ marginTop: '0.2em' }}>你預期的下一個 state 是這個嗎？如果不是，回頭檢查哪一個 D 算錯了（或哪個 flop 的 clock 其實不是 clk）。</div>
    </div>
  )
}
