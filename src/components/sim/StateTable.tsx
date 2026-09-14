import type { Netlist, StepRecord } from '@/models/divider/types'
import { toBitString } from '@/utils/bits'
import { fmtT } from '@/utils/format'

export interface StateTableProps {
  netlist: Netlist
  records: StepRecord[]
  period?: number
  /** 顯示哪些 comb 訊號（預設：所有 D 與 watch） */
  combSignals?: string[]
  /** 最多顯示幾列（從最新往前） */
  maxRows?: number
  currentIndex?: number
  showTime?: boolean
  compact?: boolean
}

export function StateTable({ netlist, records, period, combSignals, maxRows = 16, currentIndex, showTime = true, compact }: StateTableProps) {
  const inputs = netlist.inputs.map((i) => i.name)
  const stateBits = netlist.stateOrder
  const comb = combSignals ?? [...netlist.flops.map((f) => f.d), ...(netlist.watch ?? []).filter((w) => !netlist.flops.some((f) => f.d === w) && !stateBits.includes(w))]
  const rows = records.slice(Math.max(0, records.length - maxRows))
  const cur = currentIndex ?? records.length - 1
  return (
    <div className="scroll-x">
      <table className="state-table">
        <thead>
          <tr className="group-head">
            <th colSpan={showTime ? 2 : 1}>Clock edge</th>
            <th colSpan={stateBits.length + 1}>Current state（edge 前）</th>
            {inputs.length ? <th colSpan={inputs.length}>Input</th> : null}
            <th colSpan={comb.length}>Combinational（edge 前算好）</th>
            <th colSpan={stateBits.length + 1}>Next state（edge 後）</th>
            <th>Output</th>
          </tr>
          <tr>
            <th>#</th>
            {showTime ? <th>t</th> : null}
            {stateBits.map((b) => (
              <th key={b}>{b}</th>
            ))}
            <th>state</th>
            {inputs.map((i) => (
              <th key={i}>{i}</th>
            ))}
            {comb.map((c) => (
              <th key={c}>{c}</th>
            ))}
            {stateBits.map((b) => (
              <th key={b}>{b}′</th>
            ))}
            <th>state′</th>
            <th>{netlist.output}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const idx = r.edgeIndex - 1
            const cls = idx === cur ? 'current' : idx > cur ? 'future' : ''
            const before = toBitString(r.stateBefore, stateBits)
            const after = toBitString(r.stateAfter, stateBits)
            return (
              <tr key={r.edgeIndex} className={cls}>
                <td>{r.edgeIndex}</td>
                {showTime ? <td>{fmtT(r.t, period)}</td> : null}
                {stateBits.map((b) => (
                  <td key={b}>{r.stateBefore[b]}</td>
                ))}
                <td>
                  <b>{before}</b>
                </td>
                {inputs.map((i) => (
                  <td key={i}>{r.inputs[i]}</td>
                ))}
                {comb.map((c) => (
                  <td key={c}>{r.combBefore[c] ?? r.valuesAfter[c] ?? '-'}</td>
                ))}
                {stateBits.map((b) => (
                  <td key={b} className={r.stateAfter[b] !== r.stateBefore[b] ? 'changed' : ''}>
                    {r.stateAfter[b]}
                  </td>
                ))}
                <td>
                  <b>{after}</b>
                </td>
                <td className={r.output ? 'value-1' : 'value-0'}>{r.output}</td>
              </tr>
            )
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={20} className="muted">
                {compact ? '尚未推進' : '還沒有任何 clock edge。按「下一個 Clock Edge」開始。'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
