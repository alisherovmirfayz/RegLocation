import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Eye, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { fmtDateTime, KIND_LABEL, type StaffKind, type TeacherListItem } from '../../lib/types';
import { Avatar } from '../../components/Avatar';
import { Alert, Badge, Button, EmptyState, Field, Modal, PageLoader, useToast, ViewCredentialsModal } from '../../components/ui';
import { Page, SearchInput, useLoad } from './common';

export function TeacherForm({
  initial,
  onSubmit,
  submitLabel,
  busy,
}: {
  initial?: Partial<{ firstName: string; lastName: string; positionTitle: string; kind: StaffKind }>;
  onSubmit: (v: { firstName: string; lastName: string; positionTitle: string; kind?: StaffKind }) => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [v, setV] = useState({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    positionTitle: initial?.positionTitle ?? '',
    kind: initial?.kind ?? ('AUTO' as StaffKind | 'AUTO'),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          firstName: v.firstName,
          lastName: v.lastName,
          positionTitle: v.positionTitle,
          kind: v.kind === 'AUTO' ? undefined : v.kind,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя">
          <input className="input" value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} required />
        </Field>
        <Field label="Фамилия">
          <input className="input" value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} required />
        </Field>
      </div>
      <Field label="Предмет или должность" hint="Например: Математика, Английский язык, Завуч">
        <input className="input" list="rl-positions" value={v.positionTitle} onChange={(e) => setV({ ...v, positionTitle: e.target.value })} required />
        <datalist id="rl-positions">
          {['Математика', 'Английский язык', 'Русский язык', 'Узбекский язык', 'Информатика', 'Физика', 'Химия', 'Биология', 'История', 'География', 'Физкультура', 'Робототехника', 'Завуч'].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <Field label="Роль на карте" hint="Завуч — в кабинете завуча (кроме обеда и полдника), учитель — по расписанию">
        <select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as StaffKind | 'AUTO' })}>
          <option value="AUTO">Определить по должности</option>
          <option value="TEACHER">Учитель</option>
          <option value="HEAD_TEACHER">Завуч</option>
        </select>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function TeachersPage() {
  const toast = useToast();
  const { data, reload } = useLoad(() => directorApi.get<TeacherListItem[]>('/api/director/teachers'));
  const [q, setQ] = useState('');
  const [presence, setPresence] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [editing, setEditing] = useState<TeacherListItem | null>(null);
  const [credsFor, setCredsFor] = useState<TeacherListItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeacherListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarFor, setAvatarFor] = useState<string | null>(null);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data ?? []).filter(
      (t) =>
        (presence === 'ALL' || (presence === 'IN' ? t.present : !t.present)) &&
        (!query || `${t.lastName} ${t.firstName} ${t.login} ${t.positionTitle}`.toLowerCase().includes(query)),
    );
  }, [data, q, presence]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast('success', ok);
      await reload();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (!data) return <PageLoader />;
  const inSchool = data.filter((t) => t.present).length;

  return (
    <Page
      title="Учителя"
      subtitle={`Всего: ${data.length} · в школе: ${inSchool}`}
      actions={
        <Link to="/director/teachers/new">
          <Button icon={<UserPlus className="h-4 w-4" />}>Добавить учителя</Button>
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Поиск: ФИО, логин, предмет" />
        <select className="input sm:w-56" value={presence} onChange={(e) => setPresence(e.target.value as typeof presence)}>
          <option value="ALL">Присутствие: все</option>
          <option value="IN">В школе</option>
          <option value="OUT">Не в школе</option>
        </select>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && avatarFor) await act(() => directorApi.upload(`/api/director/teachers/${avatarFor}/avatar`, f), 'Фотография обновлена');
        }}
      />

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Users />} title={data.length ? 'Никого не найдено' : 'Учителей пока нет'} text={data.length ? 'Измените поиск или фильтры' : 'Создайте первый аккаунт учителя'} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3">Учитель</th>
                  <th className="px-3 py-3">Предмет / должность</th>
                  <th className="px-3 py-3">Расписание</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-3 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                <AnimatePresence initial={false}>
                  {list.map((t) => (
                    <motion.tr key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            className="group relative"
                            title="Загрузить фото"
                            onClick={() => {
                              setAvatarFor(t.id);
                              fileRef.current?.click();
                            }}
                          >
                            <Avatar name={t} url={t.avatarUrl} size={40} ring={false} className={t.present ? 'ring-2 ring-emerald-400' : ''} />
                            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
                              <Camera className="h-4 w-4 text-white" />
                            </span>
                          </button>
                          <div className="min-w-0">
                            <div className="font-semibold">
                              {t.lastName} {t.firstName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t.login} · вход: {t.lastLoginAt ? fmtDateTime(t.lastLoginAt) : 'ещё не входил'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{t.positionTitle}</div>
                        {t.kind !== 'TEACHER' && <Badge color="violet">{KIND_LABEL[t.kind]}</Badge>}
                      </td>
                      <td className="px-3 py-3">{t.timetable ? <Badge color="green">{t.timetable.lessons} ур.</Badge> : <Badge color="amber">нет</Badge>}</td>
                      <td className="px-3 py-3">
                        {t.status === 'BLOCKED' ? <Badge color="red">Заблокирован</Badge> : t.status === 'ARCHIVED' ? <Badge>Архив</Badge> : t.present ? <Badge color="green">В школе</Badge> : <Badge>Не в школе</Badge>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Логин и пароль" onClick={() => setCredsFor(t)} icon={<Eye />} />
                          <IconBtn title="Редактировать" onClick={() => setEditing(t)} icon={<Pencil />} />
                          <IconBtn title="Удалить" danger onClick={() => setConfirmDelete(t)} icon={<Trash2 />} />
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Редактирование учителя">
        {editing && (
          <TeacherForm
            initial={editing}
            busy={busy}
            submitLabel="Сохранить"
            onSubmit={async (v) => {
              setBusy(true);
              try {
                await directorApi.patch(`/api/director/teachers/${editing.id}`, { ...v, subject: v.kind === 'TEACHER' || !v.kind ? v.positionTitle : null });
                toast('success', 'Изменения сохранены');
                setEditing(null);
                await reload();
              } catch (e) {
                toast('error', (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Удалить учителя?">
        <div className="space-y-4">
          <Alert kind="warning">
            Будут удалены аккаунт, расписание и история посещаемости «{confirmDelete?.lastName} {confirmDelete?.firstName}». Это действие необратимо. Если нужно сохранить историю — используйте «В архив».
          </Alert>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                const t = confirmDelete!;
                setConfirmDelete(null);
                await act(() => directorApi.del(`/api/director/teachers/${t.id}`), 'Учитель удалён');
              }}
            >
              Удалить навсегда
            </Button>
          </div>
        </div>
      </Modal>

      <ViewCredentialsModal
        title={credsFor ? `${credsFor.lastName} ${credsFor.firstName}` : null}
        load={() => directorApi.get<{ login: string; password: string | null }>(`/api/director/teachers/${credsFor!.id}/credentials`)}
        regenerate={async () => (await directorApi.post<{ credentials: { login: string; password: string } }>(`/api/director/teachers/${credsFor!.id}/reset-password`)).credentials}
        onClose={() => setCredsFor(null)}
      />
    </Page>
  );
}

function IconBtn({ icon, title, onClick, danger }: { icon: React.ReactElement; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-2 text-slate-500 transition [&>svg]:h-4 [&>svg]:w-4 ${danger ? 'hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10' : 'hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/10'}`}
    >
      {icon}
    </button>
  );
}
