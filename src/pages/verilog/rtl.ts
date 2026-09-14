/**
 * Verilog 頁使用的 SystemVerilog 原始碼（純字串）。
 *
 * 所有 RTL 都刻意寫得很「直白」：一個 always_ff 對應一組 flop、一個 always_comb / assign 對應一塊
 * next-state logic、reset 分支就是 reset state。不用 interface、class、assertion 等進階語法。
 * 每段都標示 synthesizable（可直接合成）或 behavioral（只用來說明行為 / 驗證）。
 */

export type RtlKind = 'synthesizable' | 'behavioral'

export interface RtlBlock {
  /** 檔名（顯示在 CodeBlock 標題） */
  file: string
  kind: RtlKind
  code: string
}

// ---------------------------------------------------------------------------
// 1. /2
// ---------------------------------------------------------------------------
export const RTL_DIV2: RtlBlock = {
  file: 'div2.sv',
  kind: 'synthesizable',
  code: `
module div2 (
  input  logic clk,
  input  logic rst_n,        // async active-low reset
  output logic div_out
);
  logic q0;                  // 唯一的 state bit

  // always_ff = 一個 rising-edge DFF；「<=」左邊是 Q，右邊的算式就是 D
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) q0 <= 1'b0;  // reset state：q0 = 0（決定起始相位）
    else        q0 <= ~q0;   // d0 = NOT q0：每個 edge toggle
  end

  assign div_out = q0;       // 輸出就是 state bit，寬度 1T、duty 50%
endmodule
`,
}

// ---------------------------------------------------------------------------
// 2. synchronous /4
// ---------------------------------------------------------------------------
export const RTL_SYNC4: RtlBlock = {
  file: 'div4_sync.sv',
  kind: 'synthesizable',
  code: `
module div4_sync (
  input  logic clk,
  input  logic rst_n,
  output logic div_out
);
  logic [1:0] cnt;           // {q1, q0}：兩個 flop，共用同一條 clk

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) cnt <= 2'b00;          // reset state = 00
    else        cnt <= cnt + 2'd1;     // 合成後：d0 = ~q0，d1 = q1 ^ q0
  end

  assign div_out = cnt[1];   // q1：每 4 個 clk 一個週期、duty 50%
endmodule
`,
}

// ---------------------------------------------------------------------------
// 3. /3 state machine（明寫 case）
// ---------------------------------------------------------------------------
export const RTL_DIV3: RtlBlock = {
  file: 'div3_fsm.sv',
  kind: 'synthesizable',
  code: `
module div3_fsm (
  input  logic clk,
  input  logic rst_n,
  output logic div_out
);
  localparam logic [1:0] S0 = 2'b00, S1 = 2'b01, S2 = 2'b10;
  logic [1:0] state, next;   // state = {q1, q0}（flop）；next = {d1, d0}（組合邏輯）

  // 1) flop：只負責在 edge 把 next 抓進 state
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) state <= S0;           // reset state = 00
    else        state <= next;
  end

  // 2) next-state logic：case 的每一列 = state table 的一列
  always_comb begin
    case (state)
      S0:      next = S1;              // 00 → 01
      S1:      next = S2;              // 01 → 10
      S2:      next = S0;              // 10 → 00
      default: next = S2;              // 11（illegal）→ 10：最省 gate 的寫法（d1 = q0），一個 cycle 內回到主循環
    endcase
  end

  assign div_out = state[1];           // q1：high 1T、low 2T ⇒ duty = 1/3
endmodule
`,
}

// ---------------------------------------------------------------------------
// 4. /2 /3 dual-modulus cell（概念模型）
// ---------------------------------------------------------------------------
export const RTL_DM23: RtlBlock = {
  file: 'dm23_cell.sv',
  kind: 'synthesizable',
  code: `
module dm23_cell (
  input  logic clk,
  input  logic rst_n,
  input  logic mod,          // 0：/2；1：/3（只在 state 01 的那個 edge 被看一次）
  output logic div_out
);
  logic q0, q1;              // state = {q1, q0}

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0;            // reset state = 00
      q1 <= 1'b0;
    end else begin
      q0 <= ~(q1 | q0);      // d0 = NOR(q1, q0)
      q1 <= q0 & mod;        // d1 = q0 AND mod：mod = 1 才會多走一個 state 10
    end
  end

  // state 00 時輸出 high 一個 cycle；/2 與 /3 的每個週期都從 00 開始 ⇒ 相位連續
  assign div_out = ~(q1 | q0);
endmodule
`,
}

// ---------------------------------------------------------------------------
// 5. programmable /4 或 /6（terminal-count counter）
// ---------------------------------------------------------------------------
export const RTL_PROG46: RtlBlock = {
  file: 'div_prog46.sv',
  kind: 'synthesizable',
  code: `
module div_prog46 (
  input  logic clk,
  input  logic rst_n,
  input  logic sel,          // 0：/4；1：/6
  output logic div_out
);
  logic [2:0] cnt;           // 0..5 需要 3 bit
  logic [2:0] n_max;         // 數到這個值就歸零：n_max = N − 1
  logic       tc;            // terminal count

  assign n_max = sel ? 3'd5 : 3'd3;
  assign tc    = (cnt == n_max);

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n)  cnt <= 3'd0;
    else if (tc) cnt <= 3'd0;          // wrap：第 N 個 edge 回到 0
    else         cnt <= cnt + 3'd1;
  end

  assign div_out = (cnt == 3'd0);      // 每個週期 high 一個 clk ⇒ duty = 1/N
endmodule
`,
}

// ---------------------------------------------------------------------------
// 6. MMD behavioral model（兩級 /2 /3 cell，可參數化）
// ---------------------------------------------------------------------------
export const RTL_MMD: RtlBlock = {
  file: 'mmd.sv',
  kind: 'behavioral',
  code: `
// 一個可串接的 /2 /3 cell：
//   mod_in  ← 下一級：「這個 output cycle 允許吞一個 clk」
//   mod_out → 上一級：「本級正在 state 00 的那個 cycle」
module dm23_stage (
  input  logic clk,          // 上一級的 f_out（ripple！不是同一條 clock）
  input  logic rst_n,
  input  logic p,            // 本級的 programming bit
  input  logic mod_in,
  output logic f_out,        // 除頻後的 clock，給下一級
  output logic mod_out
);
  logic q0, q1;
  assign mod_out = ~(q1 | q0);         // state 00
  assign f_out   = mod_out;            // 同一個訊號，只是換個名字往下送

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0;
      q1 <= 1'b0;
    end else begin
      q0 <= ~(q1 | q0);
      q1 <= q0 & p & mod_in;           // 只有 p=1 且下一級允許時才走 /3
    end
  end
endmodule

// STAGES 級串接：N = 2^STAGES + p（p 的 bit 0 對應最快的第一級）
module mmd #(parameter int STAGES = 2) (
  input  logic              clk,
  input  logic              rst_n,
  input  logic [STAGES-1:0] p,
  output logic              div_out
);
  logic [STAGES:0] f;        // f[0] = clk，f[i] = 第 i 級的輸出
  logic [STAGES:0] m;        // m[i] = 第 i 級的 mod_out；最後一級的 mod_in 固定 1

  assign f[0]      = clk;
  assign m[STAGES] = 1'b1;

  for (genvar i = 0; i < STAGES; i++) begin : g_stage
    dm23_stage u_stage (
      .clk    (f[i]),
      .rst_n  (rst_n),
      .p      (p[i]),
      .mod_in (m[i+1]),
      .f_out  (f[i+1]),
      .mod_out(m[i])
    );
  end

  assign div_out = f[STAGES];
endmodule
`,
}

// ---------------------------------------------------------------------------
// 7. phase selection behavioral model（8-phase MUX + glitch-free select）
// ---------------------------------------------------------------------------
export const RTL_PMUX_NAIVE: RtlBlock = {
  file: 'pmux8_naive.sv',
  kind: 'behavioral',
  code: `
// 8 個相位（相鄰差 T/8），直接用 MUX 選。phase_sel 任意時刻改變 ⇒ 輸出直接跳到新相位的
// 「目前值」⇒ 可能出現比 T/2 窄的 runt pulse。
module pmux8_naive (
  input  logic [7:0] ph,           // ph[i] 落後 ph[0] i·T/8
  input  logic [2:0] phase_sel,
  output logic       div_out
);
  assign div_out = ph[phase_sel];  // 純組合邏輯，沒有任何同步
endmodule
`,
}

export const RTL_PMUX_GF: RtlBlock = {
  file: 'pmux8_gf.sv',
  kind: 'behavioral',
  code: `
// Glitch-free：每一相有自己的 enable flop，用「該相自己的 negedge」取樣。
// 舊相只會在自己為 0 時關閉、新相只會在自己為 0 時打開 ⇒ 輸出上不會出現半截 pulse。
module pmux8_gf (
  input  logic [7:0] ph,
  input  logic       rst_n,
  input  logic [2:0] phase_sel,
  output logic       div_out
);
  logic [7:0] en;

  for (genvar i = 0; i < 8; i++) begin : g_en
    // others_off：除了自己以外的 enable 都是 0（先關舊相，再開新相）
    logic others_off;
    assign others_off = ~|(en & ~(8'b1 << i));

    always_ff @(negedge ph[i] or negedge rst_n) begin
      if (!rst_n) en[i] <= (i == 0);                     // reset：只開 phase 0
      else        en[i] <= (phase_sel == i) && others_off;
    end
  end

  assign div_out = |(ph & en);     // AND-OR 形式的 8:1 MUX
endmodule
`,
}

// ---------------------------------------------------------------------------
// 常見 bug 片段（RTL 分頁裡的 pitfall 用）
// ---------------------------------------------------------------------------
export const SNIPPET_DIV2_BUGS = `
// (a) 沒有 reset：RTL 模擬 q0 永遠是 X（~X = X）
always_ff @(posedge clk) q0 <= ~q0;

// (b) 用 assign 做 toggle：這不是 flop，是組合迴圈（ring oscillator）
assign q0 = ~q0;

// (c) 把反相放到 clock 上：除數還是 2，只是變成 falling-edge 觸發
always_ff @(negedge clk or negedge rst_n) ...
`

export const SNIPPET_SYNC4_BUGS = `
// (a) 想「省一個 XOR」改用 ripple：q1 的 clock 變成 q0，STA 要另外定義 generated clock
always_ff @(negedge cnt[0] or negedge rst_n)
  if (!rst_n) cnt[1] <= 1'b0; else cnt[1] <= ~cnt[1];

// (b) 用 blocking「=」寫 flop：功能常常「看起來對」，但多個 always 之間會有 race
always_ff @(posedge clk) cnt = cnt + 1;
`

export const SNIPPET_DIV3_BUGS = `
// (a) 沒有 default 也沒寫 2'b11：next 在 state 11 時保持舊值 ⇒ 推斷出 latch（Bug Lab #2）
case (state)
  S0: next = S1;
  S1: next = S2;
  S2: next = S0;
endcase

// (b) default 寫成「保持」：11 → 11，永遠鎖死（Bug Lab #3）
default: next = state;
`

export const SNIPPET_DM23_BUGS = `
// (a) 「兩個 divider 各自跑，再用 MUX 選輸出」不是 dual-modulus：
//     兩個 divider 的相位各自獨立，切換時輸出會跳相位、可能出 runt
assign div_out = mod ? out3 : out2;

// (b) mod 用組合邏輯改 d0（而不是 d1）：/2 的循環會被打斷，除數不再是 2 或 3
q0 <= ~(q1 | q0) & ~mod;
`

export const SNIPPET_PROG_BUGS = `
// (a) off-by-one：想要 /4 卻寫 cnt == 4 ⇒ 數 0,1,2,3,4 五個 state ⇒ /5（Bug Lab #7）
assign tc = (cnt == 3'd4);

// (b) sel 在 cnt 已經超過新 n_max 時改變：cnt == n_max 永遠不成立 ⇒ 數到 7 才繞回 ⇒ 一個 /8 週期
//     防禦寫法：用 >= 或只在 cnt == 0 時更新 n_max
assign tc = (cnt >= n_max);
`

export const SNIPPET_MMD_BUGS = `
// (a) 少了 mod_in：每一級各自獨立除 2 或 3 ⇒ N = (2+p0)(2+p1) ∈ {4, 6, 6, 9}，不再是連續的 4～7
q1 <= q0 & p;                        // 少了 mod_in

// (b) 把所有級都接同一條 clk（想「同步化」）：f[i] 不再是下一級的 clock，
//     整個 state equation 都變了；MMD 的 modular 結構就是 ripple 的
dm23_stage u (.clk(clk), ...);
`

export const SNIPPET_PMUX_BUGS = `
// (a) 用 posedge ph[i] 取樣 enable：新相在自己為 1 的瞬間打開 ⇒ 輸出出現半個 pulse
always_ff @(posedge ph[i]) en[i] <= (phase_sel == i);

// (b) 只用一個共同 clk 同步 phase_sel：切換瞬間（posedge clk 之後 tCQ）ph0 與 ph5～ph7 是 high、
//     ph1～ph4 是 low。所以從 ph0 切到 ph5～ph7 剛好同 level、安全；切到 ph1～ph4 會立刻把輸出截斷。
//     真正的條件是「舊相與新相在切換瞬間同 level」，一條共同 clk 給不了這個保證。
always_ff @(posedge clk) sel_r <= phase_sel;
assign div_out = ph[sel_r];
`

// ---------------------------------------------------------------------------
// Bug Lab：每個案例的 bug RTL 與修正後 RTL
// ---------------------------------------------------------------------------
export interface BugRtlPair {
  buggy: RtlBlock
  fixed: RtlBlock
}

export const BUG_RTL: Record<'noReset' | 'incompleteCase' | 'lockup' | 'combLoop' | 'glitchyGate' | 'modLate' | 'offByOne' | 'shortPulse', BugRtlPair> = {
  noReset: {
    buggy: {
      file: 'div2_pair_noreset.sv',
      kind: 'synthesizable',
      code: `
// 兩路 /2，設計者希望它們同相（例如要產生 I/Q 或給兩個 slice 用）
module div2_pair_noreset (
  input  logic clk,
  output logic qa,
  output logic qb
);
  always_ff @(posedge clk) qa <= ~qa;   // 沒有 reset：qa 從 X 開始，~X 還是 X
  always_ff @(posedge clk) qb <= ~qb;   // qb 也是 X；矽上則是各自隨機的起始值
endmodule
`,
    },
    fixed: {
      file: 'div2_pair.sv',
      kind: 'synthesizable',
      code: `
module div2_pair (
  input  logic clk,
  input  logic rst_n,                   // 兩個 flop 共用同一個 reset
  output logic qa,
  output logic qb
);
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      qa <= 1'b0;                       // reset state：兩路都從 0 出發
      qb <= 1'b0;
    end else begin
      qa <= ~qa;
      qb <= ~qb;                        // 之後每個 edge 一起 toggle ⇒ 永遠同相
    end
  end
endmodule
`,
    },
  },

  incompleteCase: {
    buggy: {
      file: 'div3_incomplete_case.sv',
      kind: 'synthesizable',
      code: `
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) state <= 2'b00; else state <= next;

always_comb begin
  case (state)
    2'b00: next = 2'b01;
    2'b01: next = 2'b10;
    2'b10: next = 2'b00;
    // 2'b11 沒有寫，也沒有 default
    // ⇒ state = 11 時 next「保持上一次的值」⇒ 合成工具推斷出 latch
  endcase
end
`,
    },
    fixed: {
      file: 'div3_full_case.sv',
      kind: 'synthesizable',
      code: `
always_comb begin
  case (state)
    2'b00:   next = 2'b01;
    2'b01:   next = 2'b10;
    2'b10:   next = 2'b00;
    default: next = 2'b00;   // 11 → 00：每個 state 都有明確去向，沒有 latch
  endcase
end
// 另一個習慣：在 case 之前先給預設值 next = 2'b00; 再讓 case 覆寫
`,
    },
  },

  lockup: {
    buggy: {
      file: 'div3_lockup.sv',
      kind: 'synthesizable',
      code: `
always_comb begin
  case (state)
    2'b00:   next = 2'b01;
    2'b01:   next = 2'b10;
    2'b10:   next = 2'b00;
    default: next = state;   // 「其他 state 就保持」——看起來很安全，其實 11 → 11 永遠鎖死
  endcase
end
assign div_out = state[1];   // 鎖在 11 時 div_out 永遠是 1：輸出「停住」
`,
    },
    fixed: {
      file: 'div3_recover.sv',
      kind: 'synthesizable',
      code: `
always_comb begin
  case (state)
    2'b00:   next = 2'b01;
    2'b01:   next = 2'b10;
    2'b10:   next = 2'b00;
    default: next = 2'b00;   // 11 → 00：一個 cycle 內回到主循環
  endcase
end
`,
    },
  },

  combLoop: {
    buggy: {
      file: 'div8_comb_toggle.sv',
      kind: 'synthesizable',
      code: `
logic [1:0] cnt;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) cnt <= 2'b00; else cnt <= cnt + 2'd1;    // /4 counter

wire tc = (cnt == 2'd3);                               // terminal count（state 11）

// 想法：「tc 的時候把 div_out 反過來」⇒ /8、50% duty
// 但 assign 沒有 flop：div_out 是自己的輸入 ⇒ 組合迴圈
assign div_out = tc ? ~div_out : div_out;
`,
    },
    fixed: {
      file: 'div8_ff_toggle.sv',
      kind: 'synthesizable',
      code: `
logic [1:0] cnt;
logic       q2;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) cnt <= 2'b00; else cnt <= cnt + 2'd1;

wire tc = (cnt == 2'd3);

// toggle 放進 always_ff：q2 只在 tc = 1 的那個 edge 反相一次
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) q2 <= 1'b0; else if (tc) q2 <= ~q2;      // d2 = q2 XOR tc

assign div_out = q2;                                   // /8、duty 50%
`,
    },
  },

  glitchyGate: {
    buggy: {
      file: 'div12_comb_gate.sv',
      kind: 'synthesizable',
      code: `
// 想做 /1 或 /2：sel=0 每個 clk pulse 都放行；sel=1 每兩個放行一個
logic q0, en;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) q0 <= 1'b0; else q0 <= ~q0;

assign en      = ~sel | q0;       // 純組合邏輯：q0 在 posedge 後 tCQ 才變 ⇒ en 在 clk = 1 期間改變
assign div_out = clk & en;        // 直接用 AND 切 clock ⇒ en 中途變化 = 把 pulse 切成半截
`,
    },
    fixed: {
      file: 'div12_negedge_gate.sv',
      kind: 'synthesizable',
      code: `
logic q0, en;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) q0 <= 1'b0; else q0 <= ~q0;

// en 只在 clk 的 negedge 更新：clk = 1 的期間 en 一定是穩定的
always_ff @(negedge clk or negedge rst_n)
  if (!rst_n) en <= 1'b1; else en <= ~sel | q0;

assign div_out = clk & en;        // AND 的兩個輸入不會同時變 ⇒ 沒有 runt
// （真正的 cell 用 latch-based ICG；這裡用 negedge flop 表達同一個概念）
`,
    },
  },

  modLate: {
    buggy: {
      file: 'dm23_mod_late.sv',
      kind: 'synthesizable',
      code: `
// /2 /3 cell 本體
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) {q1, q0} <= 2'b00;
  else begin
    q0 <= ~(q1 | q0);
    q1 <= q0 & mod;                          // mod 必須在這個 edge 之前 tsetup + tAND 就穩定
  end
assign div_out = ~(q1 | q0);

// swallow 的決定「有」打進 flop（看起來已經 retime 過了）
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) sw_r <= 1'b0; else sw_r <= (q1 == 1'b0 && q0 == 1'b0);

// 但 mod 從 flop 出來後，還要經過一大塊慢的比較 / 選擇邏輯（約 90 ps）才到 cell
assign mod = sw_r & slow_compare(cfg_a, cfg_b);   // tCQ 8 + 90 + tAND 10 = 108 ps > T = 100 ps
`,
    },
    fixed: {
      file: 'dm23_mod_retimed.sv',
      kind: 'synthesizable',
      code: `
// 慢的比較邏輯的輸入是靜態設定：先打進 ok_r，不要放在每個 cycle 的路徑上
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) ok_r <= 1'b0; else ok_r <= slow_compare(cfg_a, cfg_b);

// mod 由「緊鄰 cell」的 flop 直接驅動：路徑只剩 tCQ + 1 個 AND + tsetup
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) mod_r <= 1'b0; else mod_r <= (q1 == 1'b0 && q0 == 1'b0) & ok_r;

always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) {q1, q0} <= 2'b00;
  else begin
    q0 <= ~(q1 | q0);
    q1 <= q0 & mod_r;
  end
assign div_out = ~(q1 | q0);
`,
    },
  },

  offByOne: {
    buggy: {
      file: 'div4_offbyone.sv',
      kind: 'synthesizable',
      code: `
// 目標：/4
logic [2:0] cnt;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n)              cnt <= 3'd0;
  else if (cnt == 3'd4)    cnt <= 3'd0;     // 「數到 4 就歸零」⇒ 0,1,2,3,4 共五個 state
  else                     cnt <= cnt + 3'd1;

assign div_out = (cnt == 3'd0);
`,
    },
    fixed: {
      file: 'div4_fixed.sv',
      kind: 'synthesizable',
      code: `
localparam int N = 4;
logic [2:0] cnt;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n)              cnt <= 3'd0;
  else if (cnt == N - 1)   cnt <= 3'd0;     // 0,1,2,3 ⇒ 4 個 state ⇒ /4
  else                     cnt <= cnt + 3'd1;

assign div_out = (cnt == 3'd0);
`,
    },
  },

  shortPulse: {
    buggy: {
      file: 'div4_ripple_decode.sv',
      kind: 'synthesizable',
      code: `
// ripple /4：q1 用 q0 的 negedge 當 clock
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) q0 <= 1'b0; else q0 <= ~q0;
always_ff @(negedge q0  or negedge rst_n)
  if (!rst_n) q1 <= 1'b0; else q1 <= ~q1;

// decode state 10 ⇒ 想要一個 1T 寬的 pulse
assign div_out = q1 & ~q0;

// 下一級直接拿 div_out 當 clock
always_ff @(posedge div_out or negedge rst_n)
  if (!rst_n) q2 <= 1'b0; else q2 <= ~q2;   // 期待 q2 = /8
`,
    },
    fixed: {
      file: 'div4_sync_registered.sv',
      kind: 'synthesizable',
      code: `
// 同步 counter：q0、q1 同一條 clk
logic [1:0] cnt;
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) cnt <= 2'b00; else cnt <= cnt + 2'd1;

// decode 結果先打進一個 flop 再輸出：pulse 由 flop 直接驅動，寬度剛好 1T、沒有 glitch
always_ff @(posedge clk or negedge rst_n)
  if (!rst_n) div_out <= 1'b0; else div_out <= (cnt == 2'b10);

always_ff @(posedge div_out or negedge rst_n)
  if (!rst_n) q2 <= 1'b0; else q2 <= ~q2;   // q2 = /8
`,
    },
  },
}

// ---------------------------------------------------------------------------
// 陌生電路練習：Johnson counter
// ---------------------------------------------------------------------------
export const RTL_JOHNSON: RtlBlock = {
  file: 'mystery.sv',
  kind: 'synthesizable',
  code: `
module mystery (
  input  logic clk,
  input  logic rst_n,
  output logic div_out
);
  logic q0, q1, q2;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0; q1 <= 1'b0; q2 <= 1'b0;
    end else begin
      q0 <= ~q2;
      q1 <= q0;
      q2 <= q1;
    end
  end
  assign div_out = q2;
endmodule
`,
}

export const RTL_JOHNSON_FIXED: RtlBlock = {
  file: 'mystery_fixed.sv',
  kind: 'synthesizable',
  code: `
      q0 <= ~q2 & ~(q1 & ~q0);   // 只改這一行：010 → 100、101 → 010 → 100
      q1 <= q0;
      q2 <= q1;
`,
}
