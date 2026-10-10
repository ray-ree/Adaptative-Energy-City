import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ResidentApp from './resident/ResidentApp.tsx'

const BASE = '/Adaptative-Energy-City'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Existing city/admin dashboard */}
        <Route path={`${BASE}/`}        element={<App />} />
        <Route path={`${BASE}`}         element={<App />} />
        {/* New resident dashboard */}
        <Route path={`${BASE}/resident`} element={<ResidentApp />} />
        <Route path={`${BASE}/resident/*`} element={<ResidentApp />} />
        {/* Fallback */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
