import { useState } from 'react';
import { Ban, KeyRound, LogOut, Monitor, Plus, Trash2, Unlock } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { fmtDateTime } from '../../lib/types';
import { Alert, Badge, Button, CredentialsModal, EmptyState, Field, Modal, PageLoader, useToast } from '../../components/ui';
import { Page, useLoad } from './common';

interface Account {
  id: string;
  label: string;
  login: string;
  status: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
  lastLoginAt: string | null;
  activeSessions: number;
  createdAt: string;
}

export function MonitorAccessPage() {
  const toast = useToast();
  const { data, reload } = useLoad(() => directorApi.get<Account[]>('/api/director/reception'));
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('Ресепшен');
  const [creds, setCreds] = useState<{ login: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast('success', ok);
      await reload();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (!data) return <PageLoader />;
  return (
    <Page
      title="Доступ к монитору"
      subtitle="Отдельные учётные записи для экрана ресепшена. Они могут только просматривать монитор."
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          Создать доступ
        </Button>
      }
    >
      <div className="mb-4">
        <Alert kind="info">
          На компьютере ресепшена откройте адрес монитора (<b>…/monitor/login</b>), введите логин и пароль. Сеанс монитора длится до 90 дней — повторно входить каждый день не нужно.
        </Alert>
      </div>
      {data.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Monitor />} title="Доступов к монитору пока нет" text="Создайте учётную запись для сотрудника ресепшена" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white">
                  <Monitor className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.label}</div>
                  <div className="font-mono text-sm text-slate-500">{a.login}</div>
                </div>
                {a.status === 'ACTIVE' ? <Badge color="green">Активен</Badge> : <Badge color="red">Заблокирован</Badge>}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                Последний вход: {fmtDateTime(a.lastLoginAt)} · активных сеансов: {a.activeSessions}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<KeyRound className="h-4 w-4" />}
                  onClick={() =>
                    void run(async () => {
                      const r = await directorApi.post<{ credentials: { login: string; password: string } }>(`/api/director/reception/${a.id}/reset-password`);
                      setCreds(r.credentials);
                    }, 'Пароль сброшен')
                  }
                >
                  Сбросить пароль
                </Button>
                <Button size="sm" variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => void run(() => directorApi.post(`/api/director/reception/${a.id}/revoke-sessions`), 'Сеансы завершены')}>
                  Завершить сеансы
                </Button>
                {a.status === 'ACTIVE' ? (
                  <Button size="sm" variant="secondary" icon={<Ban className="h-4 w-4" />} onClick={() => void run(() => directorApi.post(`/api/director/reception/${a.id}/block`), 'Доступ заблокирован')}>
                    Заблокировать
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon={<Unlock className="h-4 w-4" />} onClick={() => void run(() => directorApi.post(`/api/director/reception/${a.id}/unblock`), 'Доступ разблокирован')}>
                    Разблокировать
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => {
                    if (confirm(`Удалить доступ «${a.label}»?`)) void run(() => directorApi.del(`/api/director/reception/${a.id}`), 'Доступ удалён');
                  }}
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Новый доступ к монитору">
        <div className="space-y-4">
          <Field label="Название" hint="Например: Ресепшен 1 этаж, Экран в холле">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button
            className="w-full"
            loading={busy}
            disabled={!label.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await directorApi.post<{ credentials: { login: string; password: string } }>('/api/director/reception', { label: label.trim() });
                setCreating(false);
                setCreds(r.credentials);
                await reload();
              } catch (e) {
                toast('error', (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сгенерировать логин и пароль
          </Button>
        </div>
      </Modal>
      <CredentialsModal creds={creds} title="Данные для входа в монитор" onClose={() => setCreds(null)} />
    </Page>
  );
}
