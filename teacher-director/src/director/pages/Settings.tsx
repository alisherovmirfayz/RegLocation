import { useRef, useState, type FormEvent } from 'react';
import { Bell, Image as ImageIcon, KeyRound, Plus, Save, Server, Trash2, Utensils } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { DAY_SHORT, type ScheduleSettings } from '../../lib/types';
import { Alert, Badge, Button, Field, PageLoader, PasswordStrength, useToast } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { Page, useLoad } from './common';

interface SettingsData {
  schedule: ScheduleSettings;
  logoUrl: string | null;
  me: { login: string; email: string | null; firstName: string; lastName: string; isOwner: boolean };
  system: { mailConfigured: boolean; storage: string; timezone: string; ocrLangs: string };
}

export function SettingsPage() {
  const toast = useToast();
  const { data, setData, reload } = useLoad(() => directorApi.get<SettingsData>('/api/director/settings'));
  const [saving, setSaving] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  if (!data) return <PageLoader />;
  const s = data.schedule;
  const setS = (patch: Partial<ScheduleSettings>) => setData({ ...data, schedule: { ...s, ...patch } });

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await directorApi.put('/api/director/settings/schedule', s);
      toast('success', 'Расписание звонков сохранено');
      await reload();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('error', 'Пароли не совпадают');
    try {
      await directorApi.patch('/api/director/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('success', 'Пароль изменён. Другие сеансы завершены.');
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  return (
    <Page title="Настройки">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Bell className="h-5 w-5 text-brand-500" /> Расписание звонков
          </div>
          <div className="space-y-2">
            {s.lessons.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-sm font-semibold">{l.number} урок</span>
                <input className="input w-28 py-1.5" type="time" value={l.start} onChange={(e) => setS({ lessons: s.lessons.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
                <span className="text-slate-400">—</span>
                <input className="input w-28 py-1.5" type="time" value={l.end} onChange={(e) => setS({ lessons: s.lessons.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
                <button className="ml-auto rounded-lg p-1.5 text-slate-400 hover:text-rose-600" title="Удалить урок" onClick={() => setS({ lessons: s.lessons.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const last = s.lessons[s.lessons.length - 1];
              setS({ lessons: [...s.lessons, { number: (last?.number ?? 0) + 1, start: '17:00', end: '17:45' }] });
            }}
          >
            Добавить урок
          </Button>

          <div className="mt-5 mb-3 flex items-center gap-2 font-semibold">
            <Utensils className="h-5 w-5 text-orange-500" /> Питание (все присутствующие — в столовой)
          </div>
          {s.meals.map((m, i) => (
            <div key={m.key} className="mb-2 flex flex-wrap items-center gap-2">
              <label className="flex w-28 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="accent-brand-600" checked={m.enabled} onChange={(e) => setS({ meals: s.meals.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })} />
                {m.title}
              </label>
              <input className="input w-28 py-1.5" type="time" value={m.start} onChange={(e) => setS({ meals: s.meals.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
              <span className="text-slate-400">—</span>
              <input className="input w-28 py-1.5" type="time" value={m.end} onChange={(e) => setS({ meals: s.meals.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
            </div>
          ))}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Начало учебного дня" hint="Раньше этого времени кнопка «Я в школе» недоступна">
              <input className="input" type="time" value={s.startOfDay ?? '08:00'} onChange={(e) => setS({ startOfDay: e.target.value })} />
            </Field>
            <Field label="Автоматический выход (конец дня)" hint="Все отметки «В школе» закрываются, повторная отметка — завтра">
              <input className="input" type="time" value={s.endOfDay} onChange={(e) => setS({ endOfDay: e.target.value })} />
            </Field>
            <div>
              <span className="label">Учебные дни</span>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button
                    key={d}
                    onClick={() => setS({ schoolDays: s.schoolDays.includes(d) ? s.schoolDays.filter((x) => x !== d) : [...s.schoolDays, d].sort() })}
                    className={`h-9 w-10 rounded-lg text-sm font-semibold ${s.schoolDays.includes(d) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/5'}`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button className="mt-5" loading={saving} onClick={saveSchedule} icon={<Save className="h-4 w-4" />}>
            Сохранить расписание звонков
          </Button>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2 font-semibold">
              <ImageIcon className="h-5 w-5 text-brand-500" /> Логотип школы
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <Logo size={56} version={logoVersion} tone="light" />
              </div>
              <div className="rounded-2xl bg-slate-900 p-3">
                <div className="dark">
                  <Logo size={56} version={logoVersion} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">Используется оригинальное изображение без изменений, углы скругляются на экране. PNG, JPG, WEBP или HEIC, квадратное.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  await directorApi.upload('/api/director/settings/logo', f);
                  setLogoVersion(Date.now());
                  toast('success', 'Логотип обновлён на всех экранах');
                } catch (err) {
                  toast('error', (err as Error).message);
                }
              }}
            />
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                Загрузить логотип
              </Button>
              {data.logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await directorApi.del('/api/director/settings/logo');
                    setLogoVersion(Date.now());
                    await reload();
                  }}
                >
                  Вернуть стандартный
                </Button>
              )}
            </div>
          </div>

          <form onSubmit={changePassword} className="card space-y-4 p-5">
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-5 w-5 text-brand-500" /> Мой аккаунт
            </div>
            <div className="text-sm text-slate-500">
              {data.me.lastName} {data.me.firstName} · логин <b>{data.me.login}</b> · {data.me.email} {data.me.isOwner && <Badge color="blue">владелец</Badge>}
            </div>
            <Field label="Текущий пароль">
              <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
            </Field>
            <Field label="Новый пароль">
              <input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
              <PasswordStrength value={pw.newPassword} />
            </Field>
            <Field label="Повторите новый пароль">
              <input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
            </Field>
            <Button type="submit">Сменить пароль</Button>
          </form>

          <div className="card space-y-2 p-5 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Server className="h-5 w-5 text-brand-500" /> Система
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Часовой пояс</span>
              <span>{data.system.timezone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Хранилище файлов</span>
              <span>{data.system.storage === 's3' ? 'Объектное хранилище S3' : 'База данных PostgreSQL'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Почта (коды подтверждения)</span>
              {data.system.mailConfigured ? <Badge color="green">настроена</Badge> : <Badge color="red">не настроена</Badge>}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Языки распознавания</span>
              <span>{data.system.ocrLangs}</span>
            </div>
            {!data.system.mailConfigured && <Alert kind="warning">Без почты не будет работать восстановление пароля директора. Настройте SMTP в переменных окружения сервера.</Alert>}
          </div>
        </div>
      </div>
    </Page>
  );
}
