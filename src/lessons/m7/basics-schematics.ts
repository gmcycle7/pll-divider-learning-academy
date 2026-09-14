import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/**
 * Lesson 7-1 的最簡 synchronous path：
 *   clk → (launch clock tree) → Launch FF → combinational logic → Capture FF ← (capture clock tree) ← clk
 *
 * 兩條 clock tree 分開畫，是為了讓 skew（capture 到達 − launch 到達）有「看得到」的來源。
 */
export const launchCaptureSchematic: Schematic = {
  width: 640,
  height: 240,
  title: 'Launch FF → logic → Capture FF',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 160, text: 'clk', dir: 'in', description: 'clock 來源（PLL / VCO 輸出）' },
    { id: 'din', kind: 'port', x: 120, y: 80, text: 'd_in', dir: 'in', description: '上一級的資料（本課不分析）' },
    {
      id: 'bufl',
      kind: 'box',
      x: 80,
      y: 140,
      w: 74,
      h: 40,
      text: 'clock tree\n(launch)',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
      description: 'launch FF 的 clock buffer 鏈：決定 launch clock 的到達時間',
    },
    { id: 'ffl', kind: 'dff', x: 200, y: 60, label: 'Launch FF', edge: 'rising', signal: 'q', description: 'launch point：在 launch edge 把新資料送出（Q 在 tCQ 後改變）' },
    {
      id: 'logic',
      kind: 'box',
      x: 320,
      y: 50,
      w: 100,
      h: 60,
      text: 'combinational\nlogic',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
      description: '純組合邏輯：沒有記憶，輸入變了輸出過一段 delay 就跟著變',
    },
    { id: 'ffc', kind: 'dff', x: 480, y: 60, label: 'Capture FF', edge: 'rising', signal: 'q_out', description: 'capture point：在 capture edge 抓 D；D 必須提前 tsetup 穩定' },
    {
      id: 'bufc',
      kind: 'box',
      x: 370,
      y: 140,
      w: 74,
      h: 40,
      text: 'clock tree\n(capture)',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
      description: 'capture FF 的 clock buffer 鏈：與 launch 端的差就是 skew',
    },
    { id: 'qout', kind: 'port', x: 600, y: 80, text: 'q_out', dir: 'out', description: '送給下一級' },
    { id: 'j1', kind: 'dot', x: 55, y: 160 },
  ],
  wires: [
    { id: 'w_clk_bufl', from: 'clk.p', to: 'bufl.in', signal: 'clk', kind: 'clock', noArrow: true },
    { id: 'w_clk_bufc', from: 'clk.p', to: 'bufc.in', kind: 'clock', points: [[55, 160], [55, 205], [355, 205], [355, 160]], noArrow: true },
    { id: 'w_bufl_clk', from: 'bufl.out', to: 'ffl.clk', kind: 'clock', label: 'launch clk' },
    { id: 'w_bufc_clk', from: 'bufc.out', to: 'ffc.clk', kind: 'clock', label: 'capture clk' },
    { id: 'w_din', from: 'din.p', to: 'ffl.d', signal: 'd_in', kind: 'data' },
    { id: 'w_q_logic', from: 'ffl.q', to: 'logic.in', signal: 'q', kind: 'data', labelAt: 0.5 },
    { id: 'w_logic_d', from: 'logic.out', to: 'ffc.d', signal: 'd', kind: 'data', labelAt: 0.5 },
    { id: 'w_qout', from: 'ffc.q', to: 'qout.p', signal: 'q_out', kind: 'output' },
  ],
}

/** 課文用：把 setup path 高亮 */
export const launchCaptureHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q_logic', 'w_logic_d'],
  elements: ['ffl', 'logic', 'ffc'],
  tags: [
    { elementOrWire: 'ffl', text: 'launch（edge k）' },
    { elementOrWire: 'ffc', text: 'capture（edge k+1）' },
  ],
}

/** quiz 用：四個候選「路徑」的高亮 */
export const basicsQuizHighlights: Record<'clockLaunch' | 'setupPath' | 'outputPath' | 'clockCapture', SchematicHighlight> = {
  clockLaunch: { style: 'info', wires: ['w_clk_bufl', 'w_bufl_clk'], elements: ['bufl'], tags: [{ elementOrWire: 'bufl', text: 'clock path' }] },
  setupPath: { style: 'setup', wires: ['w_q_logic', 'w_logic_d'], elements: ['ffl', 'logic', 'ffc'] },
  outputPath: { style: 'info', wires: ['w_qout'], elements: ['ffc'], tags: [{ elementOrWire: 'w_qout', text: 'output' }] },
  clockCapture: { style: 'info', wires: ['w_clk_bufc', 'w_bufc_clk'], elements: ['bufc'], tags: [{ elementOrWire: 'bufc', text: 'clock path' }] },
}
