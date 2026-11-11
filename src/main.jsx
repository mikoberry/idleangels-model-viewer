import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { detectLanguage, getTranslator } from './i18n.js'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  const t = getTranslator(detectLanguage())
  throw new Error(t('app.error.missingRoot'))
}

createRoot(root).render(<App />)
