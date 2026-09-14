import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { deriveArcsFromScenario, deriveTimingArcs } from './arcs'
import { LogicDiagram } from './LogicDiagram'
import { pinPoint } from './schematic'
import { div2 } from '@/models/divider/examples'
import { div2Schematic } from '@/lessons/m1/div2-schematic'
import { div2Timing } from '@/lessons/m1/div2-timing'

describe('timing arcs（點擊元件可看 timing arc）', () => {
  it('div2：FF0 有 clk→q 的 tCQ = 8 ps 與 d→clk 的 setup/hold，INV 有 in0→out 的 tpd = 6 ps', () => {
    const arcs = deriveTimingArcs(div2, div2Schematic)
    expect(arcs.find((a) => a.element === 'ff0' && a.from === 'clk' && a.to === 'q')?.label).toBe('tCQ = 8 ps')
    expect(arcs.some((a) => a.element === 'ff0' && a.from === 'd' && a.to === 'clk' && a.kind === 'setup')).toBe(true)
    expect(arcs.find((a) => a.element === 'inv' && a.to === 'out')?.label).toBe('tpd = 6 ps')
    // 每條 arc 的 pin 都能在元件上定位（不會落到預設點以外）
    for (const a of arcs) {
      const e = div2Schematic.elements.find((x) => x.id === a.element)!
      expect(pinPoint(e, a.from)).toBeTruthy()
      expect(pinPoint(e, a.to)).toBeTruthy()
    }
  })

  it('點擊（activeElement）後 SVG 會畫出 arc 並在資訊列列出 tpd', () => {
    const arcs = deriveTimingArcs(div2, div2Schematic)
    const html = renderToString(<LogicDiagram schematic={div2Schematic} arcs={arcs} activeElement="inv" />)
    expect(html).toContain('class="arc"')
    expect(html).toContain('tpd = 6 ps')
    expect(html).toContain('timing arc')
    const idle = renderToString(<LogicDiagram schematic={div2Schematic} arcs={arcs} />)
    expect(idle).not.toContain('class="arc"')
    expect(idle).toContain('點擊元件可看 timing arc')
  })

  it('TimingScenario 的 segment 也能推導成 arc（INV 4–6 ps、FF0 tCQ 5–8 ps）', () => {
    const arcs = deriveArcsFromScenario(div2Timing)
    expect(arcs.some((a) => a.element === 'inv' && /INV 4–6 ps/.test(a.label))).toBe(true)
    expect(arcs.some((a) => a.element === 'ff0' && a.from === 'clk' && a.to === 'q' && /tCQ 5–8 ps/.test(a.label))).toBe(true)
  })
})
