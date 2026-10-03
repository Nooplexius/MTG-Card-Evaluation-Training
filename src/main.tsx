import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { App } from './app/App.tsx';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
