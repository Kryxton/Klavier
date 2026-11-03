import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyLook, loadLook } from './utils/look';
import { startServiceWorker } from './utils/update';

startServiceWorker();

applyLook(loadLook());

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
