import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useDirector } from '../DirectorApp';

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </motion.div>
  );
}

/** Загружает данные и перезагружает их при изменениях (версия справочников из Socket.IO). */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useDirector();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = async () => {
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void reload();
  }, [version, ...deps]);
  return { data, error, reload, setData };
}

export function StatCard({ label, value, icon, tone = 'blue', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'slate' | 'orange'; hint?: ReactNode }) {
  const t = {
    blue: 'from-brand-500 to-indigo-600 shadow-brand-500/30',
    green: 'from-emerald-500 to-teal-600 shadow-emerald-500/30',
    amber: 'from-amber-400 to-orange-500 shadow-amber-500/30',
    orange: 'from-orange-400 to-rose-500 shadow-orange-500/30',
    slate: 'from-slate-500 to-slate-700 shadow-slate-500/30',
  }[tone];
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${t}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-slate-500">{label}</div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input className="input max-w-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search" />;
}
