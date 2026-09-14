import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { modules, findLesson, findModule } from '@/lessons/registry'
import { useProgress, lessonStatus } from '@/hooks/useProgress'
import { useTheme } from '@/hooks/useTheme'
import { useExplainMode, MODE_LABEL, MODE_DESC, type ExplainMode } from '@/hooks/useExplainMode'

export function AppShell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const { progress } = useProgress()
  const { theme, toggle } = useTheme()
  const { mode, setMode } = useExplainMode()
  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  const crumbs = (() => {
    const m = /^\/lesson\/([^/]+)/.exec(loc.pathname)
    if (m) {
      const l = findLesson(m[1])
      const mod = l ? findModule(l.module) : undefined
      if (l && mod)
        return (
          <>
            Module {mod.id}：{mod.title} ／ Lesson {mod.id}-{l.order}：<b>{l.title}</b>
          </>
        )
    }
    if (loc.pathname.startsWith('/lab')) return <b>Module 9：陌生 Divider Reverse Engineering Lab</b>
    if (loc.pathname.startsWith('/assessment')) return <b>能力評估</b>
    if (loc.pathname.startsWith('/report')) return <b>最終報告</b>
    if (loc.pathname.startsWith('/verilog')) return <b>Verilog 教學與 Bug Lab</b>
    if (loc.pathname.startsWith('/analyze')) return <b>路徑 B：帶我分析陌生 Divider</b>
    if (loc.pathname.startsWith('/module')) return <b>Module 測驗</b>
    return <b>PLL Divider Learning Academy</b>
  })()

  const totalLessons = modules.reduce((a, m) => a + m.lessons.length, 0)
  const doneLessons = modules.reduce((a, m) => a + m.lessons.filter((l) => lessonStatus(progress[l.id]) === 'done').length, 0)

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="課程導覽">
        <Link to="/" className="sidebar-brand">
          PLL Divider Learning Academy
          <small>Clock edge → State machine → Critical path</small>
        </Link>
        <div style={{ padding: '0 1em 0.6em' }}>
          <div className="small muted">
            學習進度 {doneLessons}/{totalLessons} 課完成
          </div>
          <div className="progress-bar">
            <span style={{ width: `${(doneLessons / totalLessons) * 100}%` }} />
          </div>
        </div>
        {modules.map((m) => (
          <div className="sidebar-module" key={m.id}>
            <div className="sidebar-module-title">
              <span>
                Module {m.id}　{m.title}
              </span>
            </div>
            {m.lessons.map((l) => {
              const st = lessonStatus(progress[l.id])
              return (
                <NavLink key={l.id} to={`/lesson/${l.id}`} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <span className={`dot ${st === 'done' ? 'done' : st === 'partial' ? 'partial' : ''}`} />
                  <span>
                    {m.id}-{l.order}　{l.title}
                  </span>
                </NavLink>
              )
            })}
            <NavLink to={`/module/${m.id}/quiz`} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
              <span className="dot" style={{ background: 'transparent' }} />
              Module {m.id} 總測驗
            </NavLink>
          </div>
        ))}
        <div className="sidebar-module sidebar-section">
          <div className="sidebar-module-title">
            <span>Module 9　Reverse Engineering Lab</span>
          </div>
          <NavLink to="/lab" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="dot" />
            陌生 Divider 實戰（8 題）
          </NavLink>
          <NavLink to="/verilog" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="dot" />
            Verilog 教學與 Bug Lab
          </NavLink>
        </div>
        <div className="sidebar-module">
          <div className="sidebar-module-title">
            <span>評量</span>
          </div>
          <NavLink to="/assessment/a" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="dot" />
            Assessment A：分析陌生 divider
          </NavLink>
          <NavLink to="/assessment/b" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="dot" />
            Assessment B：找出 critical path
          </NavLink>
          <NavLink to="/report" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="dot" />
            最終報告
          </NavLink>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-sm menu-btn" onClick={() => setOpen(true)} aria-label="開啟課程導覽">
            ☰
          </button>
          <div className="crumbs">{crumbs}</div>
          <div className="topbar-actions">
            <div className="mode-switch" role="radiogroup" aria-label="解說模式" title={MODE_DESC[mode]}>
              {(['beginner', 'engineer', 'deep'] as ExplainMode[]).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} title={MODE_DESC[m]}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={toggle} aria-label="切換深淺色">
              {theme === 'dark' ? '☀︎ 淺色' : '☾ 深色'}
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
