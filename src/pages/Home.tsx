import { Link } from 'react-router-dom'
import { modules } from '@/lessons/registry'
import { useProgress, lessonStatus } from '@/hooks/useProgress'
import { div2 } from '@/models/divider/examples'
import { useSimulation } from '@/hooks/useSimulation'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { div2Schematic, div2CriticalHighlight } from '@/lessons/m1/div2-schematic'
import { fmtT } from '@/utils/format'

export function Home() {
  const { progress } = useProgress()
  return (
    <div>
      <section className="hero">
        <h1>PLL Divider Learning Academy</h1>
        <p className="sub">
          從 Clock Edge、State Machine 到 Critical Path，
          <br />
          一步一步學會分析任何陌生 Divider。
        </p>
        <div className="path-cards">
          <Link to="/lesson/m0-l1-clock" className="path-card">
            <h3>路徑 A：我是初學者，從 /2 開始</h3>
            <p>從 clock edge 與 DFF 開始，逐 edge 建立 state 的直覺，一路走到 dual-modulus、MMD、PMUX 與 DTC。</p>
          </Link>
          <Link to="/analyze" className="path-card">
            <h3>路徑 B：我有一個陌生 Divider，帶我分析</h3>
            <p>用固定的 15 步流程分析任何 divider：clock → memory element → next-state → state table → divide ratio → critical path。</p>
          </Link>
        </div>
      </section>

      <HomeDiv2 />

      <section>
        <h2>課程地圖</h2>
        <div className="module-grid">
          {modules.map((m) => (
            <div className="module-card" key={m.id}>
              <h4>
                Module {m.id}　{m.title}
              </h4>
              <div className="small muted">{m.description}</div>
              <ul>
                {m.lessons.map((l) => {
                  const st = lessonStatus(progress[l.id])
                  return (
                    <li key={l.id}>
                      <span className={`dot ${st === 'done' ? 'done' : st === 'partial' ? 'partial' : ''}`} style={{ width: 8, height: 8, borderRadius: 4, background: st === 'done' ? 'var(--ok)' : st === 'partial' ? 'var(--warn)' : 'var(--border-strong)', display: 'inline-block' }} />
                      <Link to={`/lesson/${l.id}`}>
                        {m.id}-{l.order} {l.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <div className="module-card">
            <h4>Module 9　Reverse Engineering Lab</h4>
            <div className="small muted">8 題由淺入深的陌生 divider，附工作紙、三級提示與完整解答。</div>
            <ul>
              <li>
                <Link to="/lab">進入 Lab</Link>
              </li>
              <li>
                <Link to="/verilog">Verilog 教學與 Bug Lab</Link>
              </li>
              <li>
                <Link to="/assessment/a">Assessment A / B</Link>
              </li>
              <li>
                <Link to="/report">最終報告</Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>這個網站要讓你學會的兩件事</h2>
        <div className="grid-2">
          <div className="panel">
            <div className="panel-title">① 看懂一個陌生 divider</div>
            <ol className="small" style={{ margin: 0 }}>
              <li>找出 clock input 與所有 memory element</li>
              <li>為每個 state bit 寫 next-state equation</li>
              <li>從 reset 逐 clock edge 推進，建立 state table</li>
              <li>找出 reachable / unreachable / lock-up state</li>
              <li>從 output edge interval 推 divide ratio 與 duty</li>
              <li>判斷 mode switching 是否 phase-continuous、有無 glitch</li>
              <li>判斷 reset 用途與 control signal 的 timing deadline</li>
            </ol>
          </div>
          <div className="panel">
            <div className="panel-title">② 找到真正的 critical path</div>
            <ol className="small" style={{ margin: 0 }}>
              <li>critical path 必須有 launch point 與 capture point</li>
              <li>只有會被 sensitize 的 combinational path 才算數</li>
              <li>不同 mode 的 critical path 可能不同</li>
              <li>setup path 與 hold path 不一定相同</li>
              <li>data / clock / async / output path 要分開分析</li>
              <li>reset recovery / removal 不是普通 setup / hold</li>
              <li>MOD path、carry path、PMUX select path 常比一般 feedback 更關鍵</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  )
}

/** 首頁互動 /2 divider：按 Next Clock Edge，Q 改變、波形同步、顯示 state 與 critical path */
function HomeDiv2() {
  const sim = useSimulation(div2, { period: 100 })
  const T = sim.period
  const cur = sim.current
  const tEnd = Math.max(8 * T, (sim.edgeIndex + 2) * T)
  return (
    <section className="panel" aria-label="互動 divide-by-2">
      <div className="panel-title">
        先動手：DFF Divide-by-2
        <span className="chip chip-accent">D = Q̄</span>
      </div>
      <div className="panel-sub">按「下一個 Clock Edge」，看 Q 在每個 rising edge 做什麼。紅色粗線是這個電路的 critical path：Q → inverter → D。</div>
      <div className="two-col">
        <div>
          <LogicDiagram schematic={div2Schematic} values={sim.values} highlights={[div2CriticalHighlight]} showLegend={false} />
          <div className="control-row">
            <button className="btn btn-primary" onClick={sim.next}>
              下一個 Clock Edge ▶
            </button>
            <button className="btn" onClick={sim.prev} disabled={!sim.canPrev}>
              ◀ 上一個
            </button>
            <button className="btn" onClick={() => sim.reset()}>
              ⟲ Reset
            </button>
          </div>
          <div className="narration">
            {cur ? (
              <>
                <b>Edge {cur.edgeIndex}</b>（t = {fmtT(cur.t, T)}）：edge 前 q0 = {cur.stateBefore.q0}，inverter 已算好 d0 = {cur.combBefore.d0}；edge 發生 → q0 抓進 d0 → q0 = <b className={`value-${cur.stateAfter.q0}`}>{cur.stateAfter.q0}</b>。
                {cur.edgeIndex >= 2 ? <> 每兩個 edge，q0 回到同一個值：output 週期 = 2T<sub>in</sub>，所以是 ÷2。</> : null}
              </>
            ) : (
              <>
                目前 state：q0 = <b>{sim.state.q0}</b>（reset 後）。inverter 已經算好 d0 = {sim.values.d0}，等下一個 rising edge 把它抓進 Q。
              </>
            )}
          </div>
        </div>
        <div>
          <ClockWaveform signals={sim.traces} tStart={Math.max(0, tEnd - 8 * T)} tEnd={tEnd} period={T} markers={cur ? [{ t: cur.t, label: `edge ${cur.edgeIndex}`, kind: 'edge' }] : []} showEdgeTimes highlight={['q0']} zoomable={false} />
          <div className="small muted">
            目前 state <span className="mono">q0 = {sim.state.q0}</span>　critical path：<span className="mono">FF0.clk → tCQ → INV → FF0.d（setup）</span>，要在一個 T<sub>in</sub> 內完成。
          </div>
          <Link to="/lesson/m1-l1-div2" className="btn btn-sm" style={{ marginTop: '0.5em' }}>
            到 Lesson 1-1 完整分析 /2 ▶
          </Link>
        </div>
      </div>
    </section>
  )
}
