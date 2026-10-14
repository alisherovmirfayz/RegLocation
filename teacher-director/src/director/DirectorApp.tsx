import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, KeyRound, LogOut, Map, Menu, Settings, Users, X } from 'lucide-react';
import { loadSession, logout, onUnauthorized, type SessionInfo } from '../lib/api';
import { useSocket, type Connection } from '../lib/useSocket';
import type { AuditRow, Snapshot } from '../lib/types';
import { Logo } from '../components/Logo';
import { Avatar } from '../components/Avatar';
import { Badge, PageLoader, ThemeToggle } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { DirectorLogin, DirectorRegister } from './Auth';
import { TeachersPage } from './pages/Teachers';
import { AddTeacherPage } from './pages/AddTeacher';
import { SchoolEditorPage } from './pages/SchoolEditor';
import { FloorsRoomsPage } from './pages/FloorsRooms';
import { MonitorAccessPage } from './pages/MonitorAccess';
import { SettingsPage } from './pages/Settings';

interface DirectorCtx {
  session: SessionInfo;
  snapshot: Snapshot | null;
  connection: Connection;
  /** Счётчик изменений справочников — страницы перезагружают данные при его изменении */
  version: number;
  bump: () => void;
  lastAudit: AuditRow | null;
}
const Ctx = createContext<DirectorCtx | null>(null);
export const useDirector = () => useContext(Ctx)!;

const NAV = [
  // «Добавить учителя» — кнопка на странице «Учителя»
  { to: '/director/teachers', label: 'Учителя', icon: Users },
  { to: '/director/editor', label: 'Редактор школы', icon: Map },
  { to: '/director/floors', label: 'Этажи и кабинеты', icon: Building2 },
  { to: '/director/access', label: 'Доступ к монитору', icon: KeyRound },
  { to: '/director/settings', label: 'Настройки', icon: Settings },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={false}
          onClick={onNavigate}
          className={({ isActive }) =>
            `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brand-600 shadow-lg shadow-brand-600/25" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <n.icon className="relative h-[18px] w-[18px]" />
              <span className="relative">{n.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { session, connection, snapshot } = useDirector();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/70 backdrop-blur-xl lg:flex dark:border-white/5 dark:bg-slate-900/60">
        <div className="px-5 py-5">
          <Logo size={40} subtitle="Кабинет директора" />
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto">
          <Sidebar />
        </div>
      </aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between px-5 py-5">
                <Logo size={36} />
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Sidebar onNavigate={() => setOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 py-3 backdrop-blur-xl sm:px-6 dark:border-white/5 dark:bg-slate-950/75">
          <button onClick={() => setOpen(true)} className="rounded-xl p-2 text-slate-600 lg:hidden dark:text-slate-300" aria-label="Меню">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo size={32} withText={false} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`pulse-dot relative inline-block h-2 w-2 rounded-full bg-current ${connection === 'online' ? 'text-emerald-500' : 'text-amber-500'}`} />
            <span className="hidden text-slate-500 sm:inline">{connection === 'online' ? 'Синхронизировано' : 'Переподключение…'}</span>
          </div>
          {snapshot?.clock.simulated && <Badge color="amber">ТЕСТОВЫЙ РЕЖИМ</Badge>}
          <div className="ml-auto flex items-center gap-2">
            <a href="/teacher" className="hidden text-sm text-slate-500 hover:text-brand-600 md:inline">
              Сайт учителя
            </a>
            <LangSwitch />
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-xl px-2 py-1">
              <Avatar name={session.user} url={null} size={32} ring={false} />
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-semibold">
                  {session.user.lastName} {session.user.firstName}
                </div>
                <div className="text-xs text-slate-500">{session.isOwner ? 'Директор (владелец)' : 'Директор'}</div>
              </div>
            </div>
            <button
              onClick={async () => {
                await logout('director');
                navigate('/director/login', { replace: true });
                window.location.reload();
              }}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-white/10"
              title="Выйти"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function Protected({ session, onLost }: { session: SessionInfo; onLost: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [version, setVersion] = useState(0);
  const [lastAudit, setLastAudit] = useState<AuditRow | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const connection = useSocket(
    'director',
    {
      state: (s: Snapshot) => setSnapshot(s),
      'audit:new': (a: AuditRow) => {
        setLastAudit(a);
        bump();
      },
      'structure:changed': () => bump(),
      'directory:changed': () => bump(),
    },
    onLost,
  );
  return (
    <Ctx.Provider value={{ session, snapshot, connection, version, bump, lastAudit }}>
      <Shell>
        <AnimatePresence mode="wait">
          <Routes>
            <Route index element={<Navigate to="/director/teachers" replace />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="teachers/new" element={<AddTeacherPage />} />
            <Route path="editor" element={<SchoolEditorPage />} />
            <Route path="floors" element={<FloorsRoomsPage />} />
            <Route path="access" element={<MonitorAccessPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/director/teachers" replace />} />
          </Routes>
        </AnimatePresence>
      </Shell>
    </Ctx.Provider>
  );
}

export function DirectorApp() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lost = useCallback(() => {
    setSession(null);
    navigate('/director/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    onUnauthorized('director', lost);
    loadSession('director')
      .then(setSession)
      .catch(() => setSession(null));
  }, [lost]);

  if (pathname === '/director/register') return <DirectorRegister onDone={setSession} />;
  if (pathname === '/director/login') return session ? <Navigate to="/director" replace /> : <DirectorLogin onDone={setSession} />;
  if (session === undefined) return <PageLoader />;
  if (!session) return <Navigate to="/director/login" replace />;
  return <Protected session={session} onLost={lost} />;
}

