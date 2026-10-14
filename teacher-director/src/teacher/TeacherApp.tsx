import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Route, Routes, useNavigate, Navigate, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronLeft, Lock, LogOut, User } from 'lucide-react';
import { loadSession, login, logout, onUnauthorized, teacherApi, type SessionInfo } from '../lib/api';
import { useSocket, type Connection } from '../lib/useSocket';
import type { TeacherState } from '../lib/types';
import { Logo } from '../components/Logo';
import { Avatar } from '../components/Avatar';
import { Alert, Button, PageLoader, ThemeToggle } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { TeacherHome } from './TeacherHome';
import { TeacherSchedule } from './TeacherSchedule';
import { TeacherProfile } from './TeacherProfile';

function TeacherLogin({ onDone }: { onDone: (s: SessionInfo) => void }) {
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await login('teacher', form.login.trim(), form.password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div className="ambient left-[-30%] top-[-10%] h-[45vh] w-[80vw] bg-brand-500/20" />
      <div className="ambient bottom-[-15%] right-[-25%] h-[40vh] w-[70vw] bg-sky-400/20" style={{ animationDelay: '-12s' }} />
      <div className="absolute right-4 top-4 z-10">
        <LangSwitch />
      </div>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-8 flex justify-center">
          <Logo size={56} subtitle="Кабинет учителя" />
        </div>
        <div className="card p-6">
          <h1 className="text-2xl font-bold">Вход учителя</h1>
          <p className="mt-1 text-sm text-slate-500">Логин и пароль выдаёт директор школы.</p>
          <label className="mt-5 block">
            <span className="label">Логин</span>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input py-3 pl-10"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                required
              />
            </div>
          </label>
          <label className="mt-4 block">
            <span className="label">Пароль</span>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input py-3 pl-10" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
          </label>
          {error && (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            Войти
          </Button>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Самостоятельной регистрации нет. Забыли пароль — обратитесь к директору.</p>
      </motion.form>
    </div>
  );
}

function TopBar({ state, connection }: { state: TeacherState | null; connection: Connection }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sub = pathname !== '/teacher';
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/5 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5">
        {sub ? (
          <button onClick={() => navigate('/teacher')} className="-ml-2 flex items-center gap-1 rounded-xl p-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <ChevronLeft className="h-5 w-5" /> Назад
          </button>
        ) : (
          <>
            <span className="min-[440px]:hidden">
              <Logo size={34} withText={false} />
            </span>
            <span className="hidden min-[440px]:block">
              <Logo size={34} />
            </span>
          </>
        )}
        <span
          className={`pulse-dot relative ml-1 inline-block h-2 w-2 rounded-full ${connection === 'online' ? 'text-emerald-500' : 'text-amber-500'} bg-current`}
          title={connection === 'online' ? 'Онлайн' : 'Переподключение…'}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => navigate('/teacher/schedule')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${pathname === '/teacher/schedule' ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'}`}
          >
            <CalendarDays className="h-4 w-4" /> <span className="hidden min-[400px]:inline">Расписание</span>
          </button>
          <LangSwitch />
          <ThemeToggle />
          <button onClick={() => navigate('/teacher/profile')} className="rounded-full p-0.5 transition active:scale-95" aria-label="Профиль">
            {state ? <Avatar name={state.teacher} url={state.teacher.avatarUrl} size={36} /> : <div className="h-9 w-9 rounded-full bg-slate-200" />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function TeacherApp() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);
  const [state, setState] = useState<TeacherState | null>(null);
  const navigate = useNavigate();

  const signOut = useCallback(() => {
    setSession(null);
    setState(null);
    navigate('/teacher', { replace: true });
  }, [navigate]);

  useEffect(() => {
    onUnauthorized('teacher', signOut);
    loadSession('teacher')
      .then(setSession)
      .catch(() => setSession(null));
  }, [signOut]);

  const refresh = useCallback(async () => setState(await teacherApi.get<TeacherState>('/api/teacher/state')), []);
  useEffect(() => {
    if (session) refresh().catch(() => undefined);
  }, [session, refresh]);

  const connection = useSocket('teacher', { 'teacher:state': (s: TeacherState) => setState(s) }, signOut, !!session);

  if (session === undefined) return <PageLoader />;
  if (!session) return <TeacherLogin onDone={setSession} />;

  return (
    <div className="min-h-dvh">
      <TopBar state={state} connection={connection} />
      <main className="mx-auto max-w-xl px-4 pb-10 pt-4 safe-bottom">
        {!state ? (
          <PageLoader />
        ) : (
          <AnimatePresence mode="wait">
            <Routes>
              <Route index element={<TeacherHome state={state} onState={setState} />} />
              <Route path="schedule" element={<TeacherSchedule onSaved={refresh} />} />
              <Route
                path="profile"
                element={
                  <TeacherProfile
                    state={state}
                    onState={setState}
                    onLogout={async () => {
                      await logout('teacher');
                      signOut();
                    }}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/teacher" replace />} />
            </Routes>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

export { LogOut };
