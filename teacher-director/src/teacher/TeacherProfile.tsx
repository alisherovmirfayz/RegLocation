import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { teacherApi } from '../lib/api';
import { KIND_LABEL, type TeacherState } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Badge, Button, useToast } from '../components/ui';

export function TeacherProfile({ state, onState, onLogout }: { state: TeacherState; onState: (s: TeacherState) => void; onLogout: () => void }) {
  const toast = useToast();
  const t = state.teacher;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return toast('error', 'Выберите фотографию (JPG, PNG, HEIC, WEBP)');
    if (file.size > 15 * 1024 * 1024) return toast('error', 'Фото больше 15 МБ');
    setUploading(true);
    try {
      onState(await teacherApi.upload<TeacherState>('/api/teacher/avatar', file));
      toast('success', 'Фотография обновлена');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      <h1 className="text-2xl font-bold">Профиль</h1>
      <div className="card flex flex-col items-center p-6 text-center">
        <div className="relative">
          <Avatar name={t} url={t.avatarUrl} size={112} />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white transition active:scale-95 dark:ring-slate-900"
            aria-label="Изменить фото"
          >
            <Camera className="h-5 w-5" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <div className="mt-4 text-xl font-bold">
          {t.lastName} {t.firstName}
        </div>
        <div className="text-sm text-slate-500">Логин: {t.login}</div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} icon={<Camera className="h-4 w-4" />}>
            Сменить фото
          </Button>
          {t.avatarUrl && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                onState(await teacherApi.del<TeacherState>('/api/teacher/avatar'));
                toast('success', 'Фото удалено');
              }}
            >
              Удалить
            </Button>
          )}
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <div className="font-semibold">Данные, назначенные директором</div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Предмет / должность</span>
          <span className="font-medium">{t.positionTitle}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Роль</span>
          <span className="font-medium">{KIND_LABEL[t.kind]}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-500">Классы</span>
          <span className="flex flex-wrap gap-1">{t.classes.length ? t.classes.map((c) => <Badge key={c} color="blue">{c}</Badge>) : '—'}</span>
        </div>
        <p className="text-xs text-slate-400">Изменить предмет, роль или классы может только директор.</p>
      </div>

      <div className="card flex items-start gap-3 p-5 text-sm">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
        <div>
          <div className="font-semibold">Пароль</div>
          <div className="text-slate-500">Пароль выдаёт и меняет директор. Если забыли пароль или хотите новый — обратитесь к директору.</div>
        </div>
      </div>

      <Button variant="secondary" className="w-full" onClick={onLogout} icon={<LogOut className="h-4 w-4" />}>
        Выйти из аккаунта
      </Button>
    </motion.div>
  );
}
