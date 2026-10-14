import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { MotionConfig } from 'motion/react';
import './styles.css';
import { ToastProvider } from './components/ui';
import { TeacherApp } from './teacher/TeacherApp';
import { DirectorApp } from './director/DirectorApp';
import { startI18n } from './lib/i18n';

// Русский / узбекский: перевод интерфейса по выбору пользователя
startI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/teacher/*" element={<TeacherApp />} />
            <Route path="/director/*" element={<DirectorApp />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
);
