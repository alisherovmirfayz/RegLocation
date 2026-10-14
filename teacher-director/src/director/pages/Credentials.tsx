import { useEffect, useState } from 'react';
import { KeyRound, Printer } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { Alert, Button, EmptyState, PageLoader } from '../../components/ui';
import { Page } from './common';

type Row = { id: string; name: string; subject: string | null; login: string; password: string | null; blocked: boolean };

/**
 * Логины и пароли всех учителей одним списком: открывается в отдельной вкладке,
 * печатается или сохраняется в PDF через «Печать» браузера. Каждый просмотр пишется в журнал.
 */
export function CredentialsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Загрузка один раз: запись в журнал не должна вызывать повторную загрузку
  useEffect(() => {
    directorApi
      .get<Row[]>('/api/director/credentials/teachers')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!rows) return <PageLoader />;
  const loginUrl = `${window.location.origin}/teacher`;
  const printed = new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <Page
      title="Логины и пароли учителей"
      subtitle={`Всего: ${rows.length}`}
      actions={
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Печать / сохранить PDF
        </Button>
      }
    >
      <div className="mb-4 print:hidden">
        <Alert kind="warning">Храните список в надёжном месте и не пересылайте его в общие чаты. Для PDF в окне печати выберите «Сохранить как PDF».</Alert>
      </div>
      {!rows.length ? (
        <EmptyState icon={<KeyRound className="h-6 w-6" />} title="Учителей пока нет" />
      ) : (
        <div className="print-area card overflow-hidden print:rounded-none print:border-0 print:shadow-none">
          <div className="hidden px-1 pb-3 print:block">
            <div className="text-lg font-bold">RegLocation — логины и пароли учителей</div>
            <div className="text-sm">
              Вход для учителя: <span data-no-i18n>{loginUrl}</span> · {printed}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 print:text-black">
                  <th className="w-10 px-4 py-3">№</th>
                  <th className="px-4 py-3">Учитель</th>
                  <th className="px-4 py-3">Предмет</th>
                  <th className="px-4 py-3">Логин</th>
                  <th className="px-4 py-3">Пароль</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-white/5 print:break-inside-avoid">
                    <td className="px-4 py-2.5 text-slate-400 print:text-black">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">
                      <span data-no-i18n>{r.name}</span>
                      {r.blocked && <span className="ml-2 text-xs text-rose-500">заблокирован</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 print:text-black">{r.subject ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono" data-no-i18n>
                      {r.login}
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {r.password ? <span data-no-i18n>{r.password}</span> : <span className="font-sans text-xs text-amber-600">не сохранён — сбросьте пароль</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Page>
  );
}
