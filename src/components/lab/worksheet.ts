export interface WorksheetQuestion {
  key: string
  label: string
  hint: string
}

/** 陌生 divider 分析工作紙的 15 個固定問題 */
export const WORKSHEET_QUESTIONS: WorksheetQuestion[] = [
  { key: 'q1', label: '1. Clock input 是哪一個？', hint: '找出驅動 flop clk pin 的訊號；ripple 結構中每一級的 clock 可能不同。' },
  { key: 'q2', label: '2. Sequential elements 有哪些？', hint: 'DFF、TFF、latch、dynamic node、counter…每一個都是 memory element。' },
  { key: 'q3', label: '3. State bits 有哪些？', hint: '每個 flop 的 Q 就是一個 state bit；寫出順序（MSB…LSB）。' },
  { key: 'q4', label: '4. Reset state 是什麼？', hint: 'reset 釋放後所有 state bit 的值。' },
  { key: 'q5', label: '5. 每個 D input equation 是什麼？', hint: 'd0 = f(q0, q1, mod…)，d1 = …' },
  { key: 'q6', label: '6. Reachable states 有哪些？', hint: '從 reset 逐 edge 推進，列出會出現的 state；剩下的是 unreachable。' },
  { key: 'q7', label: '7. State sequence 是什麼？', hint: '例如 00 → 01 → 10 → 00；若有 mode，每個 mode 各寫一組。' },
  { key: 'q8', label: '8. Output 在哪些 edge 改變？', hint: '對照 state sequence，output 何時 0→1、何時 1→0。' },
  { key: 'q9', label: '9. Divide ratio 是多少？', hint: '相鄰 output rising edge 之間有幾個 input clock 週期。' },
  { key: 'q10', label: '10. Duty cycle 是多少？', hint: 'output high 的時間 / output 週期。' },
  { key: 'q11', label: '11. MOD / select 的 timing deadline 是什麼？', hint: '控制訊號最晚要在哪個 edge 前 tsetup 穩定，才會影響預期的那個 cycle？' },
  { key: 'q12', label: '12. Critical path 的 launch point 是哪裡？', hint: '哪個 flop 的 Q（在哪個 edge）啟動這條最慢的資料路徑？' },
  { key: 'q13', label: '13. Capture point 是哪裡？', hint: '哪個 flop 的 D 在哪個 edge 抓資料？' },
  { key: 'q14', label: '14. 中間經過哪些 logic？', hint: '依序列出 gate：tCQ → gate1 → gate2 → … → setup。' },
  { key: 'q15', label: '15. 可能有哪些 glitch 或 illegal state？', hint: 'unused state 會不會 lock-up？有沒有 combinational clock gating / MUX 造成 runt 的風險？' },
]
