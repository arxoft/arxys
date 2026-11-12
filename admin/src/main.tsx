import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login }         from './pages/Login'
import { Layout }        from './components/Layout'
import { Ventures }      from './pages/Ventures'
import { VentureDetail } from './pages/VentureDetail'
import { Members }       from './pages/Members'
import { Workspaces }    from './pages/Workspaces'
import './index.css'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('arxys_token')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/ventures" replace />} />
          <Route path="ventures"        element={<Ventures />} />
          <Route path="ventures/:id"    element={<VentureDetail />} />
          <Route path="workspaces"      element={<Workspaces />} />
          <Route path="members"         element={<Members />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
