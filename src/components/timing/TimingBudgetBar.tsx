import type { BudgetItem } from '@/models/timing/types'
import { fmtNum } from '@/utils/format'

const COLORS: Record<string, string> = {
  tcq: '#2f6fed',
  logic: '#c8611c',
  wire: '#8a6d3b',
  mux: '#9b2c9b',
  setup: '#7a4bd6',
  hold: '#7a4bd6',
  jitter: '#6d6d6d',
  skew: '#4a90a4',
  margin: '#a0a0a0',
  slack: '#178a4c',
  'hold-req': '#7a4bd6',
}

/**
 * Timing budget 長條圖。
 *
 * skew 的方向約定（與 analyzeSetup 相同）：env.skew = capture clock 到達時間 − launch clock 到達時間。
 * analyzeSetup 把它放進 breakdown 時寫成 `value = −env.skew`，因為 breakdown 的每一項都是「吃掉多少
 * 可用時間」：skew > 0（capture 晚到）是**多給**時間，所以值為負。
 *
 * 因此它不能跟其他段一樣直接畫成一個色塊（負寬度沒有意義，硬 clamp 成 0 會讓整條 bar 比 T 長出
 * env.skew 而看不出原因）。這裡改成把 skew 畫在「T 的虛線框之外」：
 *   - skew > 0：可用時間 = T + skew，虛線框右邊多出一段淺色的「skew 借來的時間」，
 *     資料段與 slack 合起來正好填滿 T + skew。
 *   - skew < 0：capture 早到，可用時間 = T − |skew|，在框內右端標出被 skew 吃掉的那一段。
 * 兩種情況下「各段 + slack = T + skew」這個等式都看得出來。
 */
export function TimingBudgetBar({ items, total, title, unit = 'ps', height = 44 }: { items: BudgetItem[]; total: number; title?: string; unit?: string; height?: number }) {
  const width = 720
  const left = 8
  const barW = width - 16
  const skewItem = items.find((i) => i.kind === 'skew')
  /** env.skew 原值：正 = capture clock 晚到 = 多出來的可用時間 */
  const skew = skewItem ? -skewItem.value : 0
  const consumed = items.filter((i) => i.kind !== 'slack' && i.kind !== 'skew')
  const slack = items.find((i) => i.kind === 'slack')
  const sum = consumed.reduce((a, i) => a + Math.max(0, i.value), 0)
  /** 這條 path 真正可用的時間 = T·N·f + skew */
  const available = total + skew
  const scaleTotal = Math.max(total, available, sum + Math.max(0, slack?.value ?? 0))
  const px = (v: number) => (v / scaleTotal) * barW
  let xCursor = left
  const negSlack = slack && slack.value < 0
  const availX = left + px(Math.max(0, available))
  return (
    <div className="budget">
      {title ? <div className="small muted">{title}</div> : null}
      <svg viewBox={`0 0 ${width} ${height + 26}`} role="img" aria-label="timing budget">
        {/* skew > 0：虛線框之外多出來的可用時間；skew < 0：框內被吃掉的一段 */}
        {skew > 0 ? (
          <rect x={left + px(total)} y={4} width={px(skew)} height={height - 8} fill={COLORS.skew} opacity={0.16} stroke={COLORS.skew} strokeDasharray="2 2" />
        ) : skew < 0 ? (
          <rect x={left + px(total) - px(-skew)} y={4} width={px(-skew)} height={height - 8} fill={COLORS.skew} opacity={0.16} stroke={COLORS.skew} strokeDasharray="2 2" />
        ) : null}
        {/* period outline：T 本身 */}
        <rect x={left} y={4} width={px(total)} height={height - 8} fill="none" stroke="var(--fg-muted)" strokeDasharray="4 3" />
        {consumed.map((it) => {
          const w = px(Math.max(0, it.value))
          const x = xCursor
          xCursor += w
          return (
            <g key={it.key}>
              <rect x={x} y={8} width={w} height={height - 16} fill={COLORS[it.kind] ?? '#888'} opacity={0.9} />
              {w > 34 ? (
                <text x={x + w / 2} y={height / 2 + 4} textAnchor="middle" className="seg-text">
                  {it.label} {fmtNum(it.value)}
                </text>
              ) : null}
            </g>
          )
        })}
        {slack ? (
          negSlack ? (
            <g>
              <rect x={availX} y={8} width={px(-slack.value)} height={height - 16} fill="var(--danger)" opacity={0.85} />
              <text x={availX + px(-slack.value) / 2} y={height / 2 + 4} textAnchor="middle" className="seg-text">
                −{fmtNum(-slack.value)}
              </text>
            </g>
          ) : (
            <g>
              <rect x={xCursor} y={8} width={px(slack.value)} height={height - 16} fill={COLORS.slack} opacity={0.5} />
              {px(slack.value) > 40 ? (
                <text x={xCursor + px(slack.value) / 2} y={height / 2 + 4} textAnchor="middle" className="seg-text">
                  slack {fmtNum(slack.value)}
                </text>
              ) : null}
            </g>
          )
        ) : null}
        <line x1={left} x2={left + px(scaleTotal)} y1={height + 2} y2={height + 2} className="axis" />
        <text x={left} y={height + 16} className="axis-text">
          0
        </text>
        <text x={left + px(total)} y={height + 16} textAnchor="middle" className="axis-text">
          T = {fmtNum(total)} {unit}
        </text>
        {skew !== 0 ? (
          <>
            <line x1={availX} x2={availX} y1={4} y2={height + 4} stroke={COLORS.skew} strokeDasharray="3 2" />
            <text x={availX} y={height + 25} textAnchor="middle" className="axis-text" fill={COLORS.skew}>
              可用 = T {skew > 0 ? '+' : '−'} {fmtNum(Math.abs(skew))} = {fmtNum(available)} {unit}
            </text>
          </>
        ) : null}
      </svg>
      <div className="budget-legend">
        {items.map((it) =>
          it.kind === 'skew' ? (
            <span key={it.key}>
              <span className="sw" style={{ background: COLORS.skew }} />
              skew:{' '}
              <b className={skew >= 0 ? 'slack-ok' : 'slack-bad'}>
                {skew > 0 ? '+' : skew < 0 ? '−' : ''}
                {fmtNum(Math.abs(skew))} {unit}
              </b>
              <span className="muted">
                （capture clock {skew >= 0 ? '晚' : '早'}到 {fmtNum(Math.abs(skew))} {unit}
                {skew >= 0 ? '，可用時間變成 T + skew' : '，可用時間少掉 |skew|'}）
              </span>
            </span>
          ) : (
            <span key={it.key}>
              <span className="sw" style={{ background: it.kind === 'slack' && it.value < 0 ? 'var(--danger)' : COLORS[it.kind] ?? '#888' }} />
              {it.label}:{' '}
              <b className={it.kind === 'slack' ? (it.value < 0 ? 'slack-bad' : 'slack-ok') : ''}>
                {fmtNum(it.value)} {unit}
              </b>
            </span>
          ),
        )}
      </div>
    </div>
  )
}
