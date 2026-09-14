import type { Simulation } from '@/hooks/useSimulation'
import { fmtT } from '@/utils/format'

export function EdgeStepper({ sim, label = '主 clock edge', showAuto = true }: { sim: Simulation; label?: string; showAuto?: boolean }) {
  return (
    <div className="stepper" role="group" aria-label="edge stepper">
      <button className="btn" onClick={sim.prev} disabled={!sim.canPrev || sim.playing}>
        ◀ 上一個 Edge
      </button>
      <button className="btn btn-primary" onClick={sim.next} disabled={sim.playing}>
        下一個 Clock Edge ▶
      </button>
      <button className="btn" onClick={() => sim.reset()}>
        ⟲ Reset
      </button>
      {showAuto ? (
        <>
          <button className={`btn ${sim.playing ? 'active' : ''}`} onClick={() => sim.setPlaying(!sim.playing)}>
            {sim.playing ? '⏸ 暫停' : '▶ 自動播放'}
          </button>
          <label className="small muted">
            速度
            <input type="range" min={0.5} max={6} step={0.5} value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))} style={{ width: 90, marginLeft: 6 }} />
            {sim.speed}×
          </label>
        </>
      ) : null}
      <span className="status">
        {label} #{sim.edgeIndex}　t = {fmtT(sim.time, sim.period)}
      </span>
    </div>
  )
}
