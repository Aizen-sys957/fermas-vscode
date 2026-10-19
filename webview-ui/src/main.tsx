import { createRoot } from 'react-dom/client';
import { StoreProvider } from './state/store';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Fermas: #root container missing from the webview shell.');
}

createRoot(container).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
