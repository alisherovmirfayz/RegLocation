import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { MotionConfig } from 'motion/react';
import './styles.css';
import { getSession } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { MonitorPage } from './pages/MonitorPage';
import { startI18n } from './lib/i18n';

// Русский / узбекский: перевод интерфейса по выбору пользователя
startI18n();

/** Монитор доступен только после входа: иначе — /monitor/login. */
function Protected() {
  const [state, setState] = useState<'loading' | 'ok' | 'login'>('loading');
  useEffect(() => {
    getSession()
      .then((s) => setState(s ? 'ok' : 'login'))
      .catch(() => setState('login'));
  }, []);
  if (state === 'loading') return null;
  return state === 'ok' ? <MonitorPage /> : <Navigate to="/monitor/login" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/monitor" element={<Protected />} />
          <Route path="/monitor/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/monitor" replace />} />
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
