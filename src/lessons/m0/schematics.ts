import type { Schematic } from '@/components/circuit/schematic'

// ============================================================ Lesson 0-2 用的電路圖 ============================================================

/** 單一 inverter：y = NOT a，沒有 memory element 也沒有 clock 依存性 */
export const singleInvSchematic: Schematic = {
  width: 300,
  height: 140,
  title: 'Inverter：y = NOT a',
  elements: [
    { id: 'a', kind: 'port', x: 40, y: 60, text: 'a', dir: 'in', description: '輸入' },
    { id: 'inv', kind: 'inv', x: 140, y: 48, label: 'INV', description: 'y = NOT a，純組合邏輯' },
    { id: 'y', kind: 'port', x: 250, y: 60, text: 'y', dir: 'out', description: '輸出 = NOT a' },
  ],
  wires: [
    { id: 'w_a', from: 'a.p', to: 'inv.in0', signal: 'a', kind: 'data' },
    { id: 'w_y', from: 'inv.out', to: 'y.p', signal: 'y', kind: 'output' },
  ],
}

/** 3 級 inverter chain：a → b → c → out，沒有回授 */
export const invChain3Schematic: Schematic = {
  width: 480,
  height: 140,
  title: '3 級 Inverter Chain（無回授）',
  elements: [
    { id: 'pa', kind: 'port', x: 30, y: 60, text: 'a', dir: 'in' },
    { id: 'inv1', kind: 'inv', x: 110, y: 48, label: 'INV1', description: 'b = NOT a' },
    { id: 'inv2', kind: 'inv', x: 220, y: 48, label: 'INV2', description: 'c = NOT b' },
    { id: 'inv3', kind: 'inv', x: 330, y: 48, label: 'INV3', description: 'out = NOT c' },
    { id: 'pout', kind: 'port', x: 440, y: 60, text: 'out', dir: 'out' },
  ],
  wires: [
    { id: 'w_a', from: 'pa.p', to: 'inv1.in0', signal: 'a', kind: 'data' },
    { id: 'w_b', from: 'inv1.out', to: 'inv2.in0', signal: 'b', kind: 'data' },
    { id: 'w_c', from: 'inv2.out', to: 'inv3.in0', signal: 'c', kind: 'data' },
    { id: 'w_out', from: 'inv3.out', to: 'pout.p', signal: 'out', kind: 'output' },
  ],
}

/** DFF：q 在 rising edge 抓 d_in（給 examples 的 dffFollow 用） */
export const dffFollowSchematic: Schematic = {
  width: 320,
  height: 170,
  title: 'DFF：q 只在 edge 時抓 d_in',
  elements: [
    { id: 'd', kind: 'port', x: 50, y: 60, text: 'd_in', dir: 'in' },
    { id: 'clk', kind: 'port', x: 50, y: 92, text: 'clk', dir: 'in' },
    { id: 'rst', kind: 'port', x: 172, y: 170, text: 'rst_n', dir: 'in' },
    { id: 'ff', kind: 'dff', x: 140, y: 40, label: 'FF', edge: 'rising', signal: 'q' },
    { id: 'q', kind: 'port', x: 280, y: 60, text: 'q', dir: 'out' },
  ],
  wires: [
    { id: 'w_d', from: 'd.p', to: 'ff.d', signal: 'd_in', kind: 'control' },
    { id: 'w_clk', from: 'clk.p', to: 'ff.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff.q', to: 'q.p', signal: 'q', kind: 'output' },
    { id: 'w_rst', from: 'rst.p', to: 'ff.rstn', kind: 'reset', route: 'direct' },
  ],
}

/** DFF /2 feedback：q0 → INV → d0（給 examples 的 div2 用，本課自己保留一份，不依賴 m1） */
export const div2FeedbackSchematic: Schematic = {
  width: 380,
  height: 190,
  title: 'DFF Feedback：d0 = NOT q0',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'rst', kind: 'port', x: 172, y: 170, text: 'rst_n', dir: 'in' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'inv', kind: 'inv', x: 250, y: 118, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'out', kind: 'port', x: 350, y: 60, text: 'div_out', dir: 'out' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_q_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback', points: [[222, 60], [222, 130]] },
    { id: 'w_d', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[300, 130], [300, 172], [120, 172], [120, 60]] },
    { id: 'w_rst', from: 'rst.p', to: 'ff0.rstn', kind: 'reset', route: 'direct' },
  ],
}

/** Latch feedback：D = NOT Q，EN = clk（結構跟 div2FeedbackSchematic 幾乎一樣，只是把 dff 換成 latch，clk 接的是 en 而不是 edge-trigger 的 clk） */
export const latchSchematic: Schematic = {
  width: 380,
  height: 190,
  title: 'Latch Feedback：D = NOT Q，EN = clk',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'l0', kind: 'latch', x: 140, y: 40, label: 'L0', signal: 'q0', description: 'clk=1 時 transparent：q0 跟著 d0 跑' },
    { id: 'inv', kind: 'inv', x: 250, y: 118, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'out', kind: 'port', x: 350, y: 60, text: 'q0', dir: 'out' },
  ],
  wires: [
    { id: 'w_en', from: 'clk.p', to: 'l0.en', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'l0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_q_inv', from: 'l0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback', points: [[222, 60], [222, 130]] },
    { id: 'w_d', from: 'inv.out', to: 'l0.d', signal: 'd0', kind: 'feedback', points: [[300, 130], [300, 172], [120, 172], [120, 60]] },
  ],
}

/** examples 的 2 級 ringOsc：a（含 kick 覆寫）↔ b，兩級反相互相咬住──其實是雙穩態，不是振盪器 */
export const ringOsc2Schematic: Schematic = {
  width: 340,
  height: 190,
  title: '2 級 Inverter Loop（其實是雙穩態，不是振盪器）',
  elements: [
    { id: 'kick', kind: 'port', x: 30, y: 140, text: 'kick', dir: 'in', description: '拉高強迫 a=1' },
    {
      id: 'aBox',
      kind: 'box',
      x: 90,
      y: 30,
      w: 70,
      h: 48,
      text: 'a',
      description: 'a = kick ? 1 : NOT b',
      pins: [
        { name: 'b', side: 'left', pos: 0.25, label: 'b' },
        { name: 'kick', side: 'left', pos: 0.75, label: 'kick' },
        { name: 'out', side: 'right', pos: 0.5, label: 'a' },
      ],
    },
    { id: 'invB', kind: 'inv', x: 230, y: 42, label: 'INV2', description: 'b = NOT a' },
    { id: 'outp', kind: 'port', x: 300, y: 20, text: 'a', dir: 'out' },
  ],
  wires: [
    { id: 'w_kick', from: 'kick.p', to: 'aBox.kick', signal: 'kick', kind: 'control' },
    { id: 'w_a_b', from: 'aBox.out', to: 'invB.in0', signal: 'a', kind: 'data' },
    { id: 'w_a_out', from: 'aBox.out', to: 'outp.p', signal: 'a', kind: 'output' },
    { id: 'w_b_a', from: 'invB.out', to: 'aBox.b', signal: 'b', kind: 'feedback' },
  ],
}

/** 3 級 inverter ring：a（含 kick 覆寫）→ b → c → 回授到 a */
export const ringOsc3Schematic: Schematic = {
  width: 460,
  height: 190,
  title: '3 級 Inverter Ring（沒有 memory element）',
  elements: [
    { id: 'kick', kind: 'port', x: 30, y: 140, text: 'kick', dir: 'in', description: '拉高鎖定 a=1（啟動用）' },
    {
      id: 'aBox',
      kind: 'box',
      x: 90,
      y: 30,
      w: 70,
      h: 48,
      text: 'a',
      description: 'a = kick ? 1 : NOT c',
      pins: [
        { name: 'c', side: 'left', pos: 0.25, label: 'c' },
        { name: 'kick', side: 'left', pos: 0.75, label: 'kick' },
        { name: 'out', side: 'right', pos: 0.5, label: 'a' },
      ],
    },
    { id: 'invB', kind: 'inv', x: 230, y: 42, label: 'INV2', description: 'b = NOT a' },
    { id: 'invC', kind: 'inv', x: 330, y: 42, label: 'INV3', description: 'c = NOT b' },
    { id: 'outp', kind: 'port', x: 420, y: 54, text: 'a', dir: 'out' },
  ],
  wires: [
    { id: 'w_kick', from: 'kick.p', to: 'aBox.kick', signal: 'kick', kind: 'control' },
    { id: 'w_a_b', from: 'aBox.out', to: 'invB.in0', signal: 'a', kind: 'data' },
    { id: 'w_a_out', from: 'aBox.out', to: 'outp.p', signal: 'a', kind: 'output' },
    { id: 'w_b_c', from: 'invB.out', to: 'invC.in0', signal: 'b', kind: 'data' },
    { id: 'w_c_a', from: 'invC.out', to: 'aBox.c', signal: 'c', kind: 'feedback' },
  ],
}

/** 混合 comb + DFF 練習電路：FF0 ← FF1（直接回授）、FF1 ← AND(NOT(q0), en)、flag = q0 XOR q1（純組合，不是 state bit） */
export const mixedFsmSchematic: Schematic = {
  width: 620,
  height: 260,
  title: '練習電路：找出誰是 memory element',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 110, text: 'clk', dir: 'in' },
    { id: 'rst', kind: 'port', x: 30, y: 230, text: 'rst_n', dir: 'in' },
    { id: 'en', kind: 'port', x: 360, y: 230, text: 'en', dir: 'in' },
    { id: 'ff0', kind: 'dff', x: 100, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'invQ0', kind: 'inv', x: 210, y: 48, label: 'INV', description: 'q0n = NOT q0' },
    { id: 'andGate', kind: 'and', x: 290, y: 40, label: 'AND', description: 'd1 = q0n AND en' },
    { id: 'ff1', kind: 'dff', x: 420, y: 40, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'xorGate', kind: 'xor', x: 290, y: 150, label: 'XOR', description: 'flag = q0 XOR q1（純組合，不是 state bit）' },
    { id: 'flagPort', kind: 'port', x: 430, y: 170, text: 'flag', dir: 'out' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_rst0', from: 'rst.p', to: 'ff0.rstn', kind: 'reset' },
    { id: 'w_rst1', from: 'rst.p', to: 'ff1.rstn', kind: 'reset' },
    { id: 'w_en', from: 'en.p', to: 'andGate.in1', signal: 'en', kind: 'control' },
    { id: 'w_q0_inv', from: 'ff0.q', to: 'invQ0.in0', signal: 'q0', kind: 'data' },
    { id: 'w_invout', from: 'invQ0.out', to: 'andGate.in0', signal: 'q0n', kind: 'data' },
    { id: 'w_and_d1', from: 'andGate.out', to: 'ff1.d', signal: 'd1', kind: 'data' },
    { id: 'w_fb_q1', from: 'ff1.q', to: 'ff0.d', signal: 'q1', kind: 'feedback' },
    { id: 'w_q0_xor', from: 'ff0.q', to: 'xorGate.in0', signal: 'q0', kind: 'data' },
    { id: 'w_q1_xor', from: 'ff1.q', to: 'xorGate.in1', signal: 'q1', kind: 'data' },
    { id: 'w_flag', from: 'xorGate.out', to: 'flagPort.p', signal: 'flag', kind: 'output' },
  ],
}
