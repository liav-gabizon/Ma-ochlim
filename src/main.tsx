import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

declare const __SINGLE__: boolean

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (!__SINGLE__ && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* בלי service worker האפליקציה עדיין עובדת, רק בלי מצב לא מקוון */
  })
}
