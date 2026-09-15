import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// After a redeploy, an open tab may reference code chunks that no longer
// exist; Vite fires this event when a lazy chunk fails to load. Reload once
// to pick up the new build instead of showing a blank page.
window.addEventListener('vite:preloadError', () => {
  const key = 'chunk-reload-at'
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

// Open the TLS connection to the API origin early — saves a round trip on
// the first data request.
try {
  const api = import.meta.env.VITE_API_URL
  if (api) {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = new URL(api).origin
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }
} catch { /* invalid URL — skip */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
