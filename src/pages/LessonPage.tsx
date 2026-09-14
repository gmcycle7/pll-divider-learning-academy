import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { findLesson, findModule, prevNext } from '@/lessons/registry'
import type { LessonDef } from '@/lessons/types'
import { useProgress } from '@/hooks/useProgress'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { NotFound } from './NotFound'

export function LessonPage() {
  const { lessonId = '' } = useParams()
  const meta = findLesson(lessonId)
  const [lesson, setLesson] = useState<LessonDef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { progress, update } = useProgress()
  const [exerciseOpen, setExerciseOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setLesson(null)
    setError(null)
    if (!meta) return
    meta
      .load()
      .then((m) => {
        if (alive) setLesson(m.default)
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
    }
  }, [meta])

  // track last visited section
  useEffect(() => {
    if (!lesson) return
    const els = Array.from(document.querySelectorAll('[data-section]'))
    if (!els.length) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) update(lesson.id, { lastSection: (en.target as HTMLElement).dataset.section })
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [lesson, update])

  if (!meta) return <NotFound />
  const mod = findModule(meta.module)!
  const p = progress[meta.id]
  const { prev, next } = prevNext(meta.id)

  if (error)
    return (
      <div className="panel">
        <b>課程載入失敗</b>
        <pre>{error}</pre>
      </div>
    )
  if (!lesson) return <div className="muted">載入課程中…</div>

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">
          Module {mod.id}　{mod.title}　／　Lesson {mod.id}-{lesson.order}
        </div>
        <h1>{lesson.title}</h1>
        <div className="en">{lesson.titleEn}</div>
        <p className="muted">{lesson.summary}</p>
        <div className="lesson-goals">
          <h3>這一課要解決什麼問題</h3>
          <ul style={{ margin: 0 }}>
            {lesson.goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          {p?.lastSection ? (
            <div className="small muted" style={{ marginTop: '0.4em' }}>
              上次讀到：<a href={`#${p.lastSection}`}>{p.lastSection}</a>
            </div>
          ) : null}
        </div>
      </header>

      <lesson.Content />

      <section id="quiz" data-section="quiz">
        <h2>小測驗</h2>
        <QuizEngine questions={lesson.quiz} storageKey={lesson.id} onComplete={(score, total) => update(lesson.id, { quizScore: score, quizTotal: total })} />
        {p?.quizTotal ? (
          <div className="small muted">
            上次成績：{p.quizScore}/{p.quizTotal}
          </div>
        ) : null}
      </section>

      {lesson.exercise ? (
        <section id="exercise" data-section="exercise">
          <h2>陌生電路分析練習：{lesson.exercise.title}</h2>
          <div className="panel">
            <div>{lesson.exercise.prompt}</div>
            {lesson.exercise.Component ? <lesson.exercise.Component /> : null}
            {lesson.exercise.checklist ? (
              <ul>
                {lesson.exercise.checklist.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}
            {lesson.exercise.answer ? (
              <details open={exerciseOpen} onToggle={(e) => setExerciseOpen((e.target as HTMLDetailsElement).open)}>
                <summary>顯示參考答案</summary>
                <div className="solution-box">{lesson.exercise.answer}</div>
              </details>
            ) : null}
            <div className="control-row">
              <label className="toggle">
                <input type="checkbox" checked={!!p?.exerciseDone} onChange={(e) => update(lesson.id, { exerciseDone: e.target.checked })} />
                我已完成這個練習
              </label>
            </div>
          </div>
        </section>
      ) : null}

      <div className="control-row" style={{ marginTop: '2em' }}>
        <label className="toggle">
          <input type="checkbox" checked={!!p?.read} onChange={(e) => update(lesson.id, { read: e.target.checked })} />
          標記這一課為已讀
        </label>
      </div>
      <nav className="lesson-nav">
        {prev ? (
          <Link to={`/lesson/${prev.id}`} className="btn">
            ◀ {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/lesson/${next.id}`} className="btn btn-primary">
            {next.title} ▶
          </Link>
        ) : (
          <Link to="/lab" className="btn btn-primary">
            前往 Reverse Engineering Lab ▶
          </Link>
        )}
      </nav>
    </article>
  )
}
