import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Loader2, Moon, Sun, X, XCircle } from 'lucide-react';

// ───────── Кнопки ─────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700',
  secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/10',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
  danger: 'bg-rose-600 text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700',
  success: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700',
  warning: 'bg-amber-500 text-amber-950 hover:bg-amber-400',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm rounded-lg' : size === 'lg' ? 'px-5 py-3.5 text-base rounded-2xl' : 'px-4 py-2.5 text-sm rounded-xl';
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 ${sz} ${VARIANT[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand-500 ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

// ───────── Поля ─────────

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'orange' }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    blue: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  }[color];
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const cfg = {
    info: ['bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200', Info],
    warning: ['bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200', AlertTriangle],
    error: ['bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200', XCircle],
    success: ['bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200', CheckCircle2],
  } as const;
  const [cls, Icon] = cfg[kind];
  return (
    <div className={`flex gap-2.5 rounded-2xl px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ───────── Модальное окно ─────────

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl dark:bg-slate-900 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10" aria-label="Закрыть">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────── Копирование ─────────

export function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pl-3.5 dark:border-white/10 dark:bg-white/5">
        <span className={`min-w-0 flex-1 truncate text-[15px] ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</span>
        <Button size="sm" variant={copied ? 'success' : 'secondary'} onClick={copy} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>
    </div>
  );
}

export function CredentialsModal({ creds, title, onClose, note }: { creds: { login: string; password: string } | null; title: string; onClose: () => void; note?: string }) {
  return (
    <Modal open={!!creds} onClose={onClose} title={title}>
      {creds && (
        <div className="space-y-4">
          <Alert kind="warning">Пароль показывается только сейчас. Скопируйте и передайте его сотруднику лично. Позже его можно только сбросить.</Alert>
          <CopyField label="Логин" value={creds.login} />
          <CopyField label="Пароль" value={creds.password} />
          <CopyField label="Логин и пароль одной строкой" value={`Логин: ${creds.login}\nПароль: ${creds.password}`} mono={false} />
          {note && <p className="text-sm text-slate-500">{note}</p>}
          <Button className="w-full" onClick={onClose}>
            Готово
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ───────── Уведомления ─────────

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, text }].slice(-4));
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:items-end">
        <AnimatePresence>
          {list.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${
                t.kind === 'success' ? 'bg-emerald-600 text-white' : t.kind === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
              }`}
            >
              {t.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : t.kind === 'error' ? <XCircle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ───────── Тема ─────────

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('rl-theme', next ? 'dark' : 'light');
    } catch {
      /* приватный режим */
    }
    setDark(next);
  };
  return { dark, toggle };
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white" title={dark ? 'Светлая тема' : 'Тёмная тема'}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{icon}</div>
      <div className="font-semibold">{title}</div>
      {text && <div className="mt-1 max-w-sm text-sm text-slate-500">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PasswordStrength({ value }: { value: string }) {
  const score = [value.length >= 10, /[a-zа-я]/.test(value) && /[A-ZА-Я]/.test(value), /\d/.test(value), /[^A-Za-zА-Яа-я0-9]/.test(value), value.length >= 14].filter(Boolean).length;
  const labels = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный', 'Отличный'];
  const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-amber-400', 'bg-emerald-500', 'bg-emerald-600'];
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? colors[score] : 'bg-slate-200 dark:bg-white/10'}`} />
        ))}
      </div>
      <div className="mt-1 text-xs text-slate-500">{labels[score]}</div>
    </div>
  );
}
