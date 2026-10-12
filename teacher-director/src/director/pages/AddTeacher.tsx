import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { directorApi } from '../../lib/api';
import type { TeacherListItem } from '../../lib/types';
import { Alert, CredentialsModal, useToast } from '../../components/ui';
import { Page } from './common';
import { TeacherForm } from './Teachers';

export function AddTeacherPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const [created, setCreated] = useState<{ teacher: TeacherListItem; credentials: { login: string; password: string } } | null>(null);

  return (
    <Page title="Добавить учителя" subtitle="Логин и надёжный пароль создаются автоматически.">
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-3">
          <TeacherForm
            key={key}
            busy={busy}
            submitLabel="Создать аккаунт"
            onSubmit={async (v) => {
              setBusy(true);
              try {
                const r = await directorApi.post<{ teacher: TeacherListItem; credentials: { login: string; password: string } }>('/api/director/teachers', {
                  ...v,
                  subject: v.kind === 'TEACHER' || !v.kind ? v.positionTitle : null,
                });
                setCreated(r);
                setKey((k) => k + 1);
                toast('success', `Аккаунт создан: ${r.teacher.lastName} ${r.teacher.firstName}`);
              } catch (e) {
                toast('error', (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Alert kind="info">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Логин формируется из фамилии и имени латиницей (например, <b>ivanov.a</b>). Пароль — 14 случайных символов, созданных криптографически стойким генератором. Пароль будет показан
                только один раз.
              </div>
            </div>
          </Alert>
          <Alert kind="info">Учитель входит на сайт по адресу <b>/teacher</b> с телефона, загружает своё расписание и отмечает «Я в школе».</Alert>
        </div>
      </div>
      <CredentialsModal
        creds={created?.credentials ?? null}
        title={created ? `Аккаунт: ${created.teacher.lastName} ${created.teacher.firstName}` : ''}
        note="Учитель сможет сменить пароль в своём профиле."
        onClose={() => {
          setCreated(null);
          navigate('/director/teachers');
        }}
      />
    </Page>
  );
}
