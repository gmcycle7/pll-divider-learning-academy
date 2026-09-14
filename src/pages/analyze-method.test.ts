import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ANALYSIS_STEPS, AnalyzePage, CP_METHOD_STEPS } from './AnalyzePage'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'
import { allLessons } from '@/lessons/registry'

/**
 * 「我有一個陌生的 Divider」頁面承諾「第 n 步的結論就填在工作紙第 n 題」。
 * 這個順序曾經錯位過（步驟 3 對到 q3「State bits」但寫的是元件觸發行為），
 * 所以用測試釘住：兩個清單必須逐項對齊，而且每一步引用的課程都要真的存在。
 */
describe('AnalyzePage 15 步 ↔ 工作紙 15 題', () => {
  it('步驟數與工作紙題數相同，且第 n 步宣告的 worksheetKey 就是第 n 題', () => {
    expect(ANALYSIS_STEPS.length).toBe(15)
    expect(ANALYSIS_STEPS.length).toBe(WORKSHEET_QUESTIONS.length)
    expect(ANALYSIS_STEPS.map((s) => s.worksheetKey)).toEqual(WORKSHEET_QUESTIONS.map((q) => q.key))
  })

  it('步驟標題的編號與 worksheetKey 的編號一致（1. → q1 … 15. → q15）', () => {
    ANALYSIS_STEPS.forEach((s, i) => {
      expect(s.title.startsWith(`${i + 1}. `), s.title).toBe(true)
      expect(s.worksheetKey).toBe(`q${i + 1}`)
      expect(s.how.trim().length, s.title).toBeGreaterThan(40)
    })
  })

  it('每一步至少有一堂對應課程，而且 lesson id 都在 registry 裡', () => {
    const ids = new Set(allLessons.map((l) => l.id))
    for (const s of ANALYSIS_STEPS) {
      expect(s.lessonIds.length, s.title).toBeGreaterThan(0)
      for (const id of s.lessonIds) expect(ids.has(id), `${s.title} → ${id}`).toBe(true)
    }
  })

  it('關鍵字落在正確的步驟上（避免又被整批搬錯位置）', () => {
    const byKey = Object.fromEntries(ANALYSIS_STEPS.map((s) => [s.worksheetKey, s]))
    expect(byKey.q3.title).toContain('state bit')
    expect(byKey.q4.title).toContain('reset state')
    expect(byKey.q7.title).toContain('state sequence')
    expect(byKey.q9.title).toContain('divide ratio')
    expect(byKey.q10.title).toContain('duty')
    expect(byKey.q12.title).toContain('launch')
    expect(byKey.q13.title).toContain('capture')
    expect(byKey.q15.title).toContain('glitch')
  })
})

/**
 * 專案定義 skew = capture clock 到達 − launch clock 到達（analyzeSetup 的 required 是「加」skew），
 * 所以十步流程裡的 setup 公式必須是 Tclk + skew − tsetup − jitter − margin，
 * hold 則是 arrival_min ≥ thold + skew。這裡釘住方向，避免又寫成「扣掉 skew」。
 */
describe('找 critical path 的十步：skew 方向與 sta.ts 一致', () => {
  it('第 7 步用 required = Tclk + skew − tsetup − jitter − margin，並說明 skew > 0 讓 setup 變鬆', () => {
    const required = CP_METHOD_STEPS[6]
    expect(required).toContain('Tclk + skew − tsetup − jitter − margin')
    expect(required).toContain('capture clock 到達 − launch clock 到達')
    expect(required).toContain('setup 變寬鬆、hold 變嚴格')
    expect(required).not.toContain('Tclk − tsetup')
    expect(required).not.toContain('扣掉 clock skew')
  })
  it('第 9 步的 hold 檢查仍是 arrival_min ≥ thold + skew', () => {
    expect(CP_METHOD_STEPS[8]).toContain('arrival_min ≥ thold + skew')
    expect(CP_METHOD_STEPS.length).toBe(10)
  })
  it('與 analyzeSetup / analyzeHold 的實作對得起來', async () => {
    const { analyzeSetup, analyzeHold } = await import('@/models/timing/sta')
    const path = {
      id: 'p',
      name: 'p',
      type: 'setup' as const,
      launch: { element: 'a', edge: 'rising' as const, clock: 'clk' },
      capture: { element: 'b', edge: 'rising' as const, clock: 'clk', setup: 7, hold: 3 },
      segments: [{ id: 's', label: 'tCQ+logic', from: 'a', to: 'b', kind: 'tcq' as const, min: 6, max: 20 }],
    }
    const env = { period: 40, skew: 0, jitter: 2, margin: 2 }
    const base = analyzeSetup(path, env)
    // capture clock 晚到 5 ps ⇒ setup slack 變大 5 ps、hold slack 變小 5 ps
    const late = analyzeSetup(path, { ...env, skew: 5 })
    expect(late.slack - base.slack).toBe(5)
    expect(analyzeHold(path, { ...env, skew: 5 }).slack - analyzeHold(path, env).slack).toBe(-5)
  })
})

describe('AnalyzePage 能 SSR render，且頁面上真的印出每一步對應的工作紙題目', () => {
  it('render 之後 15 題的 label 全部出現在步驟旁邊', () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(AnalyzePage)))
    expect(html.length).toBeGreaterThan(3000)
    // 每一步旁邊掛一個「工作紙 …」的 chip，內容直接取自 WORKSHEET_QUESTIONS（不是另外抄一份）
    expect(html.split('工作紙 ').length - 1).toBe(WORKSHEET_QUESTIONS.length)
    for (const q of WORKSHEET_QUESTIONS) expect(html, q.key).toContain(q.label)
    for (const s of ANALYSIS_STEPS) expect(html, s.title).toContain(s.title)
  })
})
