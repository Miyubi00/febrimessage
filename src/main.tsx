import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '@/App';
import { ToastProvider } from '@/components/ui/Toast';
import { AdminAuthProvider } from '@/hooks/useAdminAuth';

import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root tidak ditemukan di index.html.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
