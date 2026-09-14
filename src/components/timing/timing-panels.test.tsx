import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { CriticalPathExplorer } from './CriticalPathExplorer'
import { TimingBudgetBar } from './TimingBudgetBar'
import { analyzeSetup } from '@/models/timing/sta'
import type { TimingScenario } from '@/models/timing/types'
import { caseBTiming, caseDTiming, caseETiming, caseFTiming, clockGateTiming } from '@/lessons/m7/cases-timing'
import { basicsTiming } from '@/lessons/m7/basics-timing'

/** React SSR 會在相鄰 text node 之間插入 <!-- -->；比對文字前先拿掉 */
const plain = (html: string) => html.replace(/<!-- -->/g, '')
const render = (sc: TimingScenario, pathId: string) => plain(renderToString(<CriticalPathExplorer scenario={sc} initialPath={pathId} />))
const renderBar = (items: Parameters<typeof TimingBudgetBar>[0]['items'], total: number) => plain(renderToString(<TimingBudgetBar items={items} total={total} />))

/**
 * katex.renderToString 會把原始的 TeX 原文放進 <annotation encoding="application/x-tex">，
 * 所以可以直接在 HTML 裡比對公式字串——公式與數字有沒有對得起來一測就知道。
 */
describe('CriticalPathExplorer：output path 不是 setup path', () => {
  const outputs: [string, TimingScenario, string, number][] = [
    ['basicsTiming.out', basicsTiming, 'out', 11],
    ['caseBTiming.out', caseBTiming, 'out', 11],
    ['caseETiming.phase-clk', caseETiming, 'phase-clk', 15],
    ['caseFTiming.gen-clk', caseFTiming, 'gen-clk', 45],
    ['clockGateTiming.clk-gclk', clockGateTiming, 'clk-gclk', 6],
  ]
  for (const [name, sc, id, latency] of outputs) {
    it(`${name}：只顯示 latency ${latency} ps，不顯示 required / slack / Tclk,min / Fmax`, () => {
      const p = sc.paths.find((x) => x.id === id)!
      expect(p.type).toBe('output')
      expect(analyzeSetup(p, sc.env).arrival).toBe(latency)
      const html = render(sc, id)
      expect(html).toContain('Output latency')
      expect(html).toContain('沒有 capture flop')
      // 這些都是 setup 專屬的東西，output path 一個都不能出現
      expect(html).not.toContain('Arrival time')
      expect(html).not.toContain('Required time')
      expect(html).not.toContain('required − arrival')
      expect(html).not.toContain('slack = 0 時') // Tclk,min 那一列
      expect(html).not.toContain('N \\cdot f') // Tclk,min 公式
      expect(html).not.toContain('Timing budget')
      expect(html).not.toContain('Setup（max delay）') // 連 Setup / Hold 分頁都不該有
    })
  }

  it('setup path 仍然顯示完整的 required / slack / Tclk,min', () => {
    const html = render(caseBTiming, 'dec4-mux')
    expect(html).toContain('Required time')
    expect(html).toContain('clk,min')
    expect(html).toContain('Timing budget')
  })

  it('hold-only path 不顯示 setup 表', () => {
    // m7 沒有 type: 'hold' 的 path，用手工 scenario 驗行為
    const sc: TimingScenario = {
      ...caseBTiming,
      paths: [{ ...caseBTiming.paths.find((p) => p.id === 'inc')!, id: 'h', type: 'hold' }],
    }
    const html = render(sc, 'h')
    expect(html).toContain('Hold slack')
    expect(html).not.toContain('Required time')
  })
})

describe('CriticalPathExplorer：Tclk,min 公式要含 N 與 f', () => {
  it('cycles = f = 1 時分母省略，分子就是 Tclk,min', () => {
    // caseB dec4-mux：42 + 7 + 3 + 2 − 0 = 54
    const s = analyzeSetup(caseBTiming.paths.find((p) => p.id === 'dec4-mux')!, caseBTiming.env)
    expect(s.tclkMin).toBe(54)
    const html = render(caseBTiming, 'dec4-mux')
    expect(html).toContain('t_{margin} - t_{skew} = 54')
    expect(html).not.toContain('\\frac{54}')
  })

  const fracCases: [string, TimingScenario, string, string, number][] = [
    // [名稱, scenario, pathId, 期待的 TeX 分數, tclkMin]
    ['caseD carry-mc（cycles = 2）', caseDTiming, 'carry-mc', '\\frac{72}{2 \\times 1}', 36],
    ['caseD local-c2（cycles = 2）', caseDTiming, 'local-c2', '\\frac{32}{2 \\times 1}', 16],
    ['caseF iface（cycles = 8）', caseFTiming, 'iface', '\\frac{65}{8 \\times 1}', 8.125],
    ['caseF loop（cycles = 8）', caseFTiming, 'loop', '\\frac{287}{8 \\times 1}', 35.875],
    ['caseE sel-window（f = 3/8）', caseETiming, 'sel-window', '\\frac{44}{1 \\times 0.375}', 117.33333333333333],
  ]
  for (const [name, sc, id, tex, tmin] of fracCases) {
    it(`${name}：公式寫出分母 N·f，左右兩邊對得起來`, () => {
      const p = sc.paths.find((x) => x.id === id)!
      const s = analyzeSetup(p, sc.env)
      expect(s.tclkMin).toBeCloseTo(tmin, 6)
      // 分子 = arrival + tsetup + jitter + margin − skew；除以 N·f 必須等於 tclkMin
      const numer = s.arrival + (p.capture.setup ?? 0) + sc.env.jitter + sc.env.margin - sc.env.skew
      expect(numer / ((p.cycles ?? 1) * (p.periodFraction ?? 1))).toBeCloseTo(s.tclkMin, 9)
      const html = render(sc, id)
      expect(html).toContain(tex)
      expect(html).toContain('N \\cdot f')
    })
  }
})

describe('TimingBudgetBar：skew 的方向與 T 框', () => {
  const items = analyzeSetup(caseBTiming.paths.find((p) => p.id === 'dec4-mux')!, { ...caseBTiming.env, skew: 5 })
  it('正 skew 在 legend 顯示 +5 並說明 capture 晚到；可用時間標成 T + skew', () => {
    expect(items.breakdown.find((b) => b.kind === 'skew')!.value).toBe(-5) // 模型裡存的是「吃掉多少時間」
    const html = renderBar(items.breakdown, items.available)
    expect(html).toContain('+5 ps')
    expect(html).toContain('capture clock 晚到')
    expect(html).toContain('可用 = T + 5 = 65 ps')
    expect(html).not.toContain('skew: −5') // 以前 legend 會把「多出的時間」寫成負數
  })
  it('負 skew 顯示為被吃掉的時間', () => {
    const neg = analyzeSetup(caseBTiming.paths.find((p) => p.id === 'dec4-mux')!, { ...caseBTiming.env, skew: -4 })
    const html = renderBar(neg.breakdown, neg.available)
    expect(html).toContain('−4 ps')
    expect(html).toContain('capture clock 早到')
    expect(html).toContain('可用 = T − 4 = 56 ps')
  })
})

/* ------------------------------------------------------------------------------------------------
 * 全站掃描：Explorer 的兩條規則對「每一個」scenario 都要成立
 *   1. type: 'output' 的 path 不得出現 required / slack / Tclk,min（它沒有 capture flop）
 *   2. cycles 或 periodFraction ≠ 1 的 path，Tclk,min 公式必須把分母 N·f 寫出來，而且左右相等
 * 這兩件事影響全站所有課的 critical path 面板，所以用 glob 一次掃完，避免以後新增 scenario 又漏掉。
 * ---------------------------------------------------------------------------------------------- */
const modules = {
  ...import.meta.glob(['@/lessons/**/*.ts', '!**/*.test.ts'], { eager: true }),
  ...import.meta.glob(['@/lab/**/*.ts', '!**/*.test.ts'], { eager: true }),
  ...import.meta.glob(['@/models/**/*.ts', '!**/*.test.ts'], { eager: true }),
}
const isScenario = (v: unknown): v is TimingScenario => {
  const sc = v as TimingScenario
  return !!sc && typeof sc === 'object' && Array.isArray(sc.paths) && !!sc.env && !!sc.schematic && Array.isArray(sc.schematic.elements)
}
const allScenarios: TimingScenario[] = []
for (const m of Object.values(modules)) for (const v of Object.values(m as Record<string, unknown>)) if (isScenario(v)) allScenarios.push(v)
/** Explorer 只會顯示預設 mode 看得見的 path（mode 不符時會 fallback 到第一條），所以掃描時要跟著它 */
const visibleInDefaultMode = (sc: TimingScenario, p: TimingScenario['paths'][number]) => !p.modes || !sc.modes?.[0] || p.modes.includes(sc.modes[0].id)

describe('全站掃描：output 與 multicycle / half-cycle path 的呈現', () => {
  it('掃到的 scenario 數量合理（避免空集合假通過）', () => {
    expect(allScenarios.length).toBeGreaterThan(15)
    expect(allScenarios.flatMap((sc) => sc.paths).filter((p) => p.type === 'output').length).toBeGreaterThan(15)
    expect(allScenarios.flatMap((sc) => sc.paths).filter((p) => (p.cycles ?? 1) * (p.periodFraction ?? 1) !== 1).length).toBeGreaterThan(15)
  })

  it('每一條 output path 都只顯示 latency', () => {
    const bad: string[] = []
    for (const sc of allScenarios) {
      for (const p of sc.paths) {
        if (p.type !== 'output' || !visibleInDefaultMode(sc, p)) continue
        const html = render(sc, p.id)
        if (!html.includes('Output latency')) bad.push(`${sc.id}/${p.id}: 沒有 Output latency`)
        for (const forbidden of ['Required time', 'Arrival time', 'slack = 0 時', 'Timing budget']) {
          if (html.includes(forbidden)) bad.push(`${sc.id}/${p.id}: 不該出現「${forbidden}」`)
        }
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([])
  })

  it('每一條 cycles / periodFraction ≠ 1 的 path，公式的分母與數字都對得起來', () => {
    const bad: string[] = []
    for (const sc of allScenarios) {
      for (const p of sc.paths) {
        const denom = (p.cycles ?? 1) * (p.periodFraction ?? 1)
        if (denom === 1 || p.type === 'output' || p.type === 'hold') continue
        const r = analyzeSetup(p, sc.env)
        const numer = r.arrival + (p.capture.setup ?? 0) + sc.env.jitter + sc.env.margin - sc.env.skew
        if (Math.abs(numer / denom - r.tclkMin) > 1e-9) bad.push(`${sc.id}/${p.id}: 分子/分母 ≠ tclkMin`)
        if (!visibleInDefaultMode(sc, p)) continue // 非預設 mode 的 path 在面板上點不到，只驗數字
        const html = render(sc, p.id)
        if (!html.includes('N \\cdot f')) bad.push(`${sc.id}/${p.id}: 公式沒有寫出分母 N·f`)
        if (!html.includes(`可用時間 = `)) bad.push(`${sc.id}/${p.id}: 沒有說明可用時間`)
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([])
  })
})

/**
 * async（PMUX select window）與 pulse-width（clock 自己的形狀）不是 setup path：
 * 它們的失敗模式分別是 runt / double edge 與 clock pulse 太窄。
 * T_clk,min 對這兩種仍然有意義（安全切換的最小 Tvco、容得下 pulse 的最小 T），
 * 但「F_max = 1/Tclk,min」的說法只對真正的 register-to-register path 成立。
 */
describe('CriticalPathExplorer：async 與 pulse-width 的失敗模式不能寫成 setup', () => {
  const collect = (sc: TimingScenario, type: string) => sc.paths.filter((p) => p.type === type).map((p) => [sc, p.id] as const)
  const all = [caseETiming, caseFTiming, clockGateTiming, caseBTiming, caseDTiming, basicsTiming]
  const asyncPaths = all.flatMap((sc) => collect(sc, 'async'))
  const pwPaths = all.flatMap((sc) => collect(sc, 'pulse-width'))

  it('測試真的有掃到 async / pulse-width path（避免空集合假通過）', () => {
    expect(asyncPaths.length).toBeGreaterThan(0)
    expect(pwPaths.length + asyncPaths.length).toBeGreaterThan(1)
  })

  for (const [sc, id] of asyncPaths) {
    it(`${sc.id}.${id}（async）：slack 標成 Window slack、不談 Fmax`, () => {
      const html = render(sc, id)
      expect(html).toContain('Window slack')
      // 不可以出現 setup 的失敗敘述
      expect(html).not.toContain('setup violation：資料來不及')
      // Tclk,min 這一列仍在（= 能安全切換的最小 Tvco），但不能把它說成 Fmax
      expect(html).toContain('T<sub>clk,min</sub>')
      expect(html).toContain('能安全切換的最小 T')
      expect(html).not.toMatch(/F<sub>max<\/sub> = 1 \/ T<sub>clk,min<\/sub>/)
    })
  }

  for (const [sc, id] of pwPaths) {
    it(`${sc.id}.${id}（pulse-width）：slack 標成 Pulse-width slack、Tclk,min 由 pulse width 決定`, () => {
      const html = render(sc, id)
      expect(html).toContain('Pulse-width slack')
      expect(html).not.toContain('setup violation：資料來不及')
      expect(html).toContain('由 pulse width 決定')
      expect(html).not.toMatch(/F<sub>max<\/sub> = 1 \/ T<sub>clk,min<\/sub>/)
    })
  }
})
