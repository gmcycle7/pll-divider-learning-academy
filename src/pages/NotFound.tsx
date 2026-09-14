import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="panel">
      <h1 style={{ marginTop: 0 }}>找不到這個頁面</h1>
      <p className="muted">這個路徑不存在。回到首頁，或從左側課程導覽選一課。</p>
      <Link to="/" className="btn btn-primary">
        回首頁
      </Link>
    </div>
  )
}
