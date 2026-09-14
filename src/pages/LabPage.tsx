import { Link } from 'react-router-dom'
import { exercises } from '@/lab/exercises'
import { useProgress } from '@/hooks/useProgress'
import { Callout, Steps } from '@/components/content'
import { clampHint, difficultyStars, labProgressKey, WORKSHEET_TOTAL, worksheetFilledCount } from '@/lab/hints'

type Status = 'none' | 'partial' | 'done'

const TEN_STEPS: string[] = [
  '列出所有 sequential element（flop / latch）與它們各自的 clock 和觸發 edge。',
  '選 launch point：哪個 flop 的 Q、在哪一個 edge 把資料送出去。',
  '選 capture point：哪個 flop 的 D、在哪一個 edge 把資料抓進去。',
  '畫出 launch → capture 之間的 combinational cone（每一個 gate、MUX、wire）。',
  '檢查 sensitization：這條路徑在目前的 state / mode 下會不會真的傳遞訊號。',
  '累加 max delay：tCQ + Σ gate + wire，得到 arrival time。',
  '算 available time：launch edge 到 capture edge 的間隔（同 edge 一個 T、rising→falling 半個 T、不同 clock 要看實際到達時間）。',
  '算 setup slack = available + skew − tsetup − jitter − margin − arrival；slack = 0 時的 T 就是 Tclk,min。',
  '用 min delay 檢查 hold：tCQ,min + logic,min ≥ thold + skew（與 T 無關）。',
  '另外檢查 pulse width、reset recovery / removal、以及 MOD / sel 等 control signal 的 deadline；換 mode 後重做一次。',
]

export function LabPage() {
  const { progress } = useProgress()
  const rows = exercises.map((e) => {
    const p = progress[labProgressKey(e.id)]
    const hints = clampHint(p?.hintsUsed)
    const filled = worksheetFilledCount(e.id)
    const status: Status = p?.exerciseDone ? 'done' : hints > 0 || filled > 0 ? 'partial' : 'none'
    return { e, hints, filled, status }
  })
  const doneCount = rows.filter((r) => r.status === 'done').length
  const percent = Math.round((doneCount / Math.max(1, exercises.length)) * 100)

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">Module 9　Reverse Engineering Lab</div>
        <h1>陌生 Divider Reverse Engineering Lab</h1>
        <div className="en">Reverse-engineering an unfamiliar divider, eight circuits from easy to hard</div>
        <p className="muted">
          前面八個 module 教的是「已知的電路怎麼分析」。這裡反過來：給你一張<b>沒有註解、沒有訊號名稱</b>的電路圖，你要自己找出 clock、memory element、state 序列、除頻比、duty，以及真正的 critical path。8 題由淺入深，每題附 15 題工作紙、三級提示與完整解答。
        </p>
        <div className="lesson-goals">
          <h3>Lab 進度</h3>
          <div className="control-row" style={{ margin: '0.2em 0 0.4em' }}>
            <span className="chip chip-ok">{doneCount} / {exercises.length} 題已完成</span>
            <span className="small muted">完成 = 填完工作紙、看過解答、並勾選「我已完成」。</span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      </header>

      <section id="flow" data-section="flow">
        <h2>
          每一題的流程
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>How each exercise works</span>
        </h2>
        <Steps
          items={[
            <>
              <b>先看 schematic，不要按模擬。</b>元件只標 U1、U2…，走線只標 n1、n2…。問自己：誰有 clk pin？誰有記憶？feedback 從哪裡回到哪裡？
            </>,
            <>
              <b>填 15 題工作紙。</b>1～5 只靠看圖；6～10 用紙筆從 reset state 逐 edge 推，再用模擬器「下一個 Clock Edge」逐步對答案；11～15 是 timing。工作紙會自動存在瀏覽器，可以匯出 Markdown。
            </>,
            <>
              <b>卡住再開提示，而且要依序開。</b>Hint 1 只告訴你先看哪個 block；Hint 2 給部分 next-state equation；Hint 3 直接攤開模擬器產生的前兩個 output 週期 state table。每開一個都會記錄，之後在最終報告看得到。
            </>,
            <>
              <b>最後才看完整解答。</b>解答包含逐 edge 說明、state table、除數推導、critical path scenario（可以自己改 T、skew、jitter 看 slack）與自我檢查題。看完勾「我已完成」。
            </>,
          ]}
        />
        <Callout kind="method" title="找 critical path 的十步 checklist（摘要）">
          <ol className="small" style={{ margin: '0 0 0.5em' }}>
            {TEN_STEPS.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <Link to="/lesson/m7-l2-cp-method" className="btn btn-sm">
            完整版在 Lesson 7-2：如何從陌生電路找 Critical Path ▶
          </Link>
        </Callout>
      </section>

      <section id="exercises" data-section="exercises">
        <h2>
          題目清單
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>Exercises</span>
        </h2>
        <p className="small muted">星等代表難度（★ 最簡單 ～ ★★★★★ 最難）。建議依序做：後面的題目會用到前面題目建立的習慣。</p>
        <div className="grid-2">
          {rows.map(({ e, hints, filled, status }) => (
            <Link key={e.id} to={`/lab/${e.id}`} className="path-card" style={{ borderColor: status === 'done' ? 'var(--ok)' : undefined }}>
              <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6em', flexWrap: 'wrap' }}>
                <span>
                  題目 {e.order}　<span title={`難度 ${e.difficulty}/5`} style={{ color: 'var(--warn)', letterSpacing: '0.05em' }}>{difficultyStars(e.difficulty)}</span>
                </span>
                <StatusChip status={status} />
              </div>
              <h3 style={{ marginTop: '0.3em' }}>{e.title}</h3>
              <p>{e.summary}</p>
              <div className="control-row" style={{ margin: '0.5em 0 0', gap: '0.5em' }}>
                <span className={`chip ${filled === WORKSHEET_TOTAL ? 'chip-ok' : ''}`}>
                  工作紙 {filled}/{WORKSHEET_TOTAL}
                </span>
                <span className={`chip ${hints > 0 ? 'chip-warn' : ''}`}>Hint 已用 {hints}/3</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="after" data-section="after">
        <h2>
          做完之後
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.8em', marginLeft: '0.6em' }}>What next</span>
        </h2>
        <div className="grid-3">
          <div className="panel">
            <div className="panel-title">路徑 B：分析你自己的電路</div>
            <p className="small muted">同一份 15 題工作紙，套用到你手上真正的 divider。</p>
            <Link to="/analyze" className="btn btn-sm">
              前往 ▶
            </Link>
          </div>
          <div className="panel">
            <div className="panel-title">能力評估 A / B</div>
            <p className="small muted">限時、不提供 hint 的綜合測驗。</p>
            <Link to="/assessment/a" className="btn btn-sm">
              前往 ▶
            </Link>
          </div>
          <div className="panel">
            <div className="panel-title">最終報告</div>
            <p className="small muted">整理每一課的測驗成績、Lab 完成度與 hint 使用數。</p>
            <Link to="/report" className="btn btn-sm">
              前往 ▶
            </Link>
          </div>
        </div>
      </section>
    </article>
  )
}

function StatusChip({ status }: { status: Status }) {
  if (status === 'done') return <span className="chip chip-ok">已完成</span>
  if (status === 'partial') return <span className="chip chip-warn">進行中</span>
  return <span className="chip">未開始</span>
}
