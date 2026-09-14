import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { allLessons } from '@/lessons/registry'

/**
 * Smoke render：每一課的 Content 與 exercise Component 都要能在 SSR 下 render，
 * 而且不能殘留 stub / placeholder 標記。
 */
describe('lesson content renders', () => {
  for (const meta of allLessons) {
    it(`${meta.id} renders without throwing`, async () => {
      const def = (await meta.load()).default
      const html = renderToString(
        <MemoryRouter>
          <def.Content />
        </MemoryRouter>,
      )
      expect(html.length).toBeGreaterThan(3000)
      expect(html).not.toMatch(/PDLA_STUB|Lorem|TODO|之後再補/i)
      // KaTeX 解析失敗會輸出 class="katex-error" 的紅字（常見原因：JS 字串裡的單反斜線把 \\Delta 吃成 Delta、\\t 變 TAB）
      expect(html, `${meta.id} 含 KaTeX 解析錯誤`).not.toContain('katex-error')
      if (def.exercise?.Component) {
        const ex = renderToString(
          <MemoryRouter>
            <def.exercise.Component />
          </MemoryRouter>,
        )
        expect(ex.length).toBeGreaterThan(100)
      }
    })
  }
})
