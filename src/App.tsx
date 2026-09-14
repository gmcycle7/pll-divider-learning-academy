import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Home } from '@/pages/Home'
import { LessonPage } from '@/pages/LessonPage'
import { ModuleQuizPage } from '@/pages/ModuleQuizPage'
import { NotFound } from '@/pages/NotFound'

const LabPage = lazy(() => import('@/pages/LabPage').then((m) => ({ default: m.LabPage })))
const LabExercisePage = lazy(() => import('@/pages/LabExercisePage').then((m) => ({ default: m.LabExercisePage })))
const AssessmentPage = lazy(() => import('@/pages/AssessmentPage').then((m) => ({ default: m.AssessmentPage })))
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const VerilogPage = lazy(() => import('@/pages/VerilogPage').then((m) => ({ default: m.VerilogPage })))
const AnalyzePage = lazy(() => import('@/pages/AnalyzePage').then((m) => ({ default: m.AnalyzePage })))

const Loading = () => <div className="muted">載入中…</div>

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/lesson/:lessonId" element={<LessonPage />} />
            <Route path="/module/:moduleId/quiz" element={<ModuleQuizPage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/lab/:exerciseId" element={<LabExercisePage />} />
            <Route path="/assessment/:which" element={<AssessmentPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/verilog" element={<VerilogPage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
