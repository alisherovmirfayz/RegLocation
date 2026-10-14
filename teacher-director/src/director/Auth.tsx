import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { directorApi, login, setCsrf, type SessionInfo } from '../lib/api';
import { Logo } from '../components/Logo';
import { Alert, Button, Field, Modal, PageLoader, PasswordStrength, ThemeToggle } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';

interface PublicStatus {
  ownerRegistered: boolean;
  registrationAvailable: boolean;
  registrationProblem: string | null;
}

export function useStatus() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  useEffect(() => {
    directorApi
      .get<PublicStatus>('/api/public/status')
      .then(setStatus)
      .catch(() => setStatus({ ownerRegistered: true, registrationAvailable: false, registrationProblem: 'Сервер недоступен' }));
  }, []);
  return status;
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="ambient left-[-10%] top-[-10%] h-[50vh] w-[50vw] bg-brand-500/20" />
      <div className="ambient bottom-[-20%] right-[-10%] h-[50vh] w-[50vw] bg-indigo-500/15" style={{ animationDelay: '-12s' }} />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LangSwitch />
        <ThemeToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={56} subtitle="Кабинет директора" />
        </div>
        <div className="card p-7">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}

export function DirectorRegister({ onDone }: { onDone: (s: SessionInfo) => void }) {
  const status = useStatus();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', login: '', email: '', password: '', passwordConfirm: '' });
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status?.ownerRegistered) navigate('/director/login', { replace: true });
  }, [status, navigate]);

  if (!status) return <PageLoader />;

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.passwordConfirm) return setError('Пароли не совпадают');
    setBusy(true);
    try {
      const r = await directorApi.post<{ verificationId: string; message: string }>('/api/auth/director/register/start', form);
      setVerificationId(r.verificationId);
      setMessage(r.message);
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const s = await directorApi.post<SessionInfo>('/api/auth/director/register/verify', { verificationId, code: code.trim() });
      setCsrf('director', s.csrfToken);
      onDone(s);
      navigate('/director', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell title="Регистрация директора" subtitle="Создание основного аккаунта директора. Выполняется один раз.">
      {!status.registrationAvailable ? (
        <Alert kind="warning">
          Регистрация сейчас недоступна. {status.registrationProblem} Обратитесь к тому, кто настраивал хостинг RegLocation.
        </Alert>
      ) : (
        <AnimatePresence mode="wait">
          {step === 'form' ? (
            <motion.form key="form" onSubmit={start} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Имя">
                  <input className="input" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required />
                </Field>
                <Field label="Фамилия">
                  <input className="input" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
                </Field>
              </div>
              <Field label="Логин" hint="Латинские буквы, цифры, точка, дефис">
                <input className="input" value={form.login} onChange={set('login')} autoComplete="username" autoCapitalize="none" required />
              </Field>
              <Field label="Email" hint="Должен совпадать с email владельца, указанным при настройке хостинга">
                <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
              </Field>
              <Field label="Пароль" hint="Не менее 10 символов, буквы и цифры">
                <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
                <PasswordStrength value={form.password} />
              </Field>
              <Field label="Подтверждение пароля">
                <input className="input" type="password" value={form.passwordConfirm} onChange={set('passwordConfirm')} autoComplete="new-password" required />
              </Field>
              {error && <Alert kind="error">{error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Зарегистрироваться
              </Button>
            </motion.form>
          ) : (
            <motion.form key="code" onSubmit={verify} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <Alert kind="info">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" /> {message} Код действует 15 минут.
                </div>
              </Alert>
              <Field label="Код из письма">
                <input
                  className="input text-center text-2xl font-bold tracking-[0.5em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
              </Field>
              {error && <Alert kind="error">{error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={busy} icon={<ShieldCheck className="h-5 w-5" />}>
                Подтвердить и войти
              </Button>
              <button type="button" className="w-full text-sm text-slate-500 hover:text-brand-600" onClick={() => setStep('form')}>
                Изменить данные или отправить код заново
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      )}
    </AuthShell>
  );
}

function RecoveryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Восстановление доступа">
      {step === 'email' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await directorApi.post<{ verificationId: string; message: string }>('/api/auth/director/recover/start', { email });
              setVerificationId(r.verificationId);
              setMsg(r.message);
              setStep('code');
            });
          }}
        >
          <p className="text-sm text-slate-500">Укажите email директора. На него придёт одноразовый код.</p>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>
            Получить код
          </Button>
        </form>
      )}
      {step === 'code' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await directorApi.post('/api/auth/director/recover/verify', { verificationId, code, newPassword: password });
              setStep('done');
            });
          }}
        >
          <Alert kind="info">{msg}</Alert>
          <Field label="Код из письма">
            <input className="input text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          <Field label="Новый пароль" hint="Не менее 10 символов, буквы и цифры">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <PasswordStrength value={password} />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>
            Сменить пароль
          </Button>
        </form>
      )}
      {step === 'done' && (
        <div className="space-y-4">
          <Alert kind="success">Пароль изменён. Все прежние сеансы завершены. Войдите с новым паролем.</Alert>
          <Button className="w-full" onClick={onClose}>
            Перейти ко входу
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function DirectorLogin({ onDone }: { onDone: (s: SessionInfo) => void }) {
  const status = useStatus();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);

  useEffect(() => {
    if (status && !status.ownerRegistered) navigate('/director/register', { replace: true });
  }, [status, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await login('director', form.login.trim(), form.password));
      navigate('/director', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <PageLoader />;
  return (
    <AuthShell title="Вход директора">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Логин">
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" autoComplete="username" autoCapitalize="none" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required autoFocus />
          </div>
        </Field>
        <Field label="Пароль">
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Войти
        </Button>
        <button type="button" onClick={() => setRecover(true)} className="flex w-full items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-brand-600">
          <KeyRound className="h-4 w-4" /> Забыли пароль?
        </button>
        <p className="text-center text-xs text-slate-400">
          Учитель? <Link to="/teacher" className="font-medium text-brand-600">Вход учителя</Link>
        </p>
      </form>
      <RecoveryModal open={recover} onClose={() => setRecover(false)} />
    </AuthShell>
  );
}
