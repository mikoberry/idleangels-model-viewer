import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('缺少 React 根节点')
}

createRoot(root).render(<App />)
