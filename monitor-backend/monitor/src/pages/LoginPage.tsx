import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Loader2, Lock, MonitorSmartphone, User } from 'lucide-react';
import { login } from '../lib/api';
import { Logo } from '../components/Logo';
import { LangSwitch } from '../components/LangSwitch';
import { MadeBy } from '../components/MadeBy';

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.login.trim(), form.password);
      navigate('/monitor', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-4">
      <div className="ambient left-[-10%] top-[-10%] h-[60vh] w-[50vw] bg-brand-500/25" />
      <div className="ambient bottom-[-20%] right-[-5%] h-[55vh] w-[45vw] bg-indigo-500/20" style={{ animationDelay: '-12s' }} />
      <div className="absolute right-5 top-5 z-10">
        <LangSwitch />
      </div>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-brand-900/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
      >
        <Logo size={52} subtitle="Монитор ресепшена" />
        <h1 className="mt-8 flex items-center gap-2 text-2xl font-bold">
          <MonitorSmartphone className="h-6 w-6 text-brand-500" /> Вход в монитор
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Учётную запись выдаёт директор в разделе «Доступ к монитору».</p>
        <label className="mt-6 block text-sm font-medium">
          Логин
          <div className="relative mt-1.5">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              autoComplete="username"
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5"
              required
            />
          </div>
        </label>
        <label className="mt-4 block text-sm font-medium">
          Пароль
          <div className="relative mt-1.5">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5"
              required
            />
          </div>
        </label>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </motion.div>
        )}
        <button
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Войти в монитор
        </button>
      </motion.form>
      <MadeBy className="absolute inset-x-0 bottom-5" />
    </div>
  );
}
