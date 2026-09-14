import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { findModule } from '@/lessons/registry'
import type { QuizQuestion } from '@/components/quiz/types'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { useLocalState } from '@/hooks/useProgress'
import { NotFound } from './NotFound'

/** Module 總測驗：把該 module 所有 lesson 的 quiz 合併，題目順序固定 */
export function ModuleQuizPage() {
  const { moduleId = '' } = useParams()
  const mod = findModule(Number(moduleId))
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [scores, setScores] = useLocalState<Record<string, { score: number; total: number; at: number }>>('pdla.moduleQuiz', {})
  useEffect(() => {
    if (!mod) return
    let alive = true
    Promise.all(mod.lessons.map((l) => l.load())).then((ms) => {
      if (!alive) return
      const qs = ms.flatMap((m, i) => m.default.quiz.map((q) => ({ ...q, id: `${mod.lessons[i].id}:${q.id}` })))
      setQuestions(qs)
    })
    return () => {
      alive = false
    }
  }, [mod])
  if (!mod) return <NotFound />
  const last = scores[String(mod.id)]
  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">Module {mod.id} 總測驗</div>
        <h1>{mod.title}</h1>
        <p className="muted">{mod.description}</p>
        {last ? (
          <div className="small muted">
            上次：{last.score}/{last.total}（{new Date(last.at).toLocaleString()}）
          </div>
        ) : null}
      </header>
      {questions ? (
        <QuizEngine title={`Module ${mod.id} 總測驗`} questions={questions} storageKey={`module-${mod.id}`} onComplete={(score, total) => setScores({ ...scores, [String(mod.id)]: { score, total, at: Date.now() } })} />
      ) : (
        <div className="muted">載入題目中…</div>
      )}
      <nav className="lesson-nav">
        <Link to={`/lesson/${mod.lessons[0].id}`} className="btn">
          ◀ 回到 Module {mod.id} 第一課
        </Link>
        <Link to="/" className="btn">
          回首頁
        </Link>
      </nav>
    </article>
  )
}
