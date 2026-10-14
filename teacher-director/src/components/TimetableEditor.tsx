import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Eraser, FileUp, Image as ImageIcon, ScanText, Save, Sparkles, Undo2 } from 'lucide-react';
import { ApiError, client } from '../lib/api';
import { DAY_NAMES, DAY_SHORT, type DraftEntry, type RecognitionResult, type TimetableResponse } from '../lib/types';
import { Alert, Badge, Button, PageLoader, useToast } from './ui';

interface Cell {
  className: string;
  roomLabel: string;
  needsReview: boolean;
  notes: string[];
  classConfidence?: number;
  roomConfidence?: number;
  classBox?: DraftEntry['classBox'];
  roomBox?: DraftEntry['roomBox'];
}

const key = (d: number, l: number) => `${d}:${l}`;
/** Форматы, которые сервер умеет распознавать (тип файла сервер всё равно проверяет по содержимому). */
export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.heic,.heif,.webp,.tif,.tiff,.bmp,.gif,.avif,image/*';
const FILE_EXT = /\.(pdf|png|jpe?g|heic|heif|webp|tiff?|bmp|gif|avif)$/i;
const CLASS_RE = /^\d{1,2}[A-ZА-ЯЁ]$/;
// Кириллические буквы-двойники («ЗВ» выглядит как «3B») заменяем на латиницу и цифры
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', З: '3', Б: '6' };
const normClass = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .replace(/\s|-/g, '')
    .replace(/[АВСЕНКМОРТХЗБ]/g, (ch) => LOOKALIKE[ch] ?? ch)
    // «O» в номере класса — это ноль: «1OA» → «10A»
    .replace(/^(\d?)O(?=[A-Z]$)/, '$10');

export function TimetableEditor({ role, base, onSaved }: { role: 'teacher' | 'director'; base: string; onSaved?: () => void }) {
  const api = useMemo(() => client(role), [role]);
  const toast = useToast();
  const [data, setData] = useState<TimetableResponse | null>(null);
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [original, setOriginal] = useState<Map<string, Cell>>(new Map());
  const [day, setDay] = useState(1);
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;
  const [busy, setBusy] = useState<'ocr' | 'save' | null>(null);
  const [ocr, setOcr] = useState<{ result: RecognitionResult; sourceFileId: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [focusBox, setFocusBox] = useState<DraftEntry['classBox'] | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const r = await api.get<TimetableResponse>(`${base}/timetable`);
    setData(r);
    const m = new Map<string, Cell>();
    for (const e of r.timetable?.entries ?? []) m.set(key(e.dayOfWeek, e.lessonNumber), { className: e.className, roomLabel: e.roomLabel, needsReview: false, notes: [] });
    setCells(m);
    setOriginal(new Map(m));
    const today = ((new Date().getDay() + 6) % 7) + 1;
    setDay(r.schoolDays.includes(today) ? today : r.schoolDays[0] ?? 1);
  };

  useEffect(() => {
    load().catch((e) => toast('error', (e as Error).message));
  }, [base]);

  const roomCodes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.rooms ?? []) {
      m.set(r.code.toLowerCase(), r.code);
      m.set(r.name.toLowerCase().replace(/\s+/g, ''), r.code);
    }
    return m;
  }, [data]);
  // «303 (A)» — кабинет 303 (буква корпуса/крыла), если отдельного «303A» нет
  const resolveRoom = (s: string) => {
    const t = s.trim().toLowerCase();
    const wing = /^(\d{2,4})\s*[-(]?\s*([a-zа-я])\s*\)?$/.exec(t);
    return roomCodes.get(t) ?? roomCodes.get(t.replace(/\s+/g, '')) ?? (wing ? roomCodes.get(wing[1]! + wing[2]!) ?? roomCodes.get(wing[1]!) : undefined) ?? null;
  };

  const setCell = (d: number, l: number, patch: Partial<Cell>) =>
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(key(d, l)) ?? { className: '', roomLabel: '', needsReview: false, notes: [] };
      next.set(key(d, l), { ...cur, ...patch, needsReview: false });
      return next;
    });

  const recognize = async (file: File) => {
    if (!FILE_EXT.test(file.name) && !(file.type === 'application/pdf' || file.type.startsWith('image/'))) {
      toast('error', 'Загрузите PDF или изображение: PNG, JPG, HEIC, WEBP, TIFF, BMP, GIF');
      return;
    }
    // Слишком большие фото уменьшаются автоматически при загрузке (см. lib/api.ts)
    if (file.size > 60 * 1024 * 1024) {
      toast('error', 'Файл слишком большой (больше 60 МБ)');
      return;
    }
    setBusy('ocr');
    setErrors([]);
    try {
      const r = await api.upload<{ result: RecognitionResult; sourceFileId: string }>(`${base}/timetable/recognize`, file);
      setOcr(r);
      const m = new Map<string, Cell>();
      for (const e of r.result.entries) {
        m.set(key(e.dayOfWeek, e.lessonNumber), {
          className: e.className,
          roomLabel: e.roomLabel,
          needsReview: e.needsReview,
          notes: e.notes,
          classConfidence: e.classConfidence,
          roomConfidence: e.roomConfidence,
          classBox: e.classBox,
          roomBox: e.roomBox,
        });
      }
      setCells(m);
      const firstDay = r.result.entries[0]?.dayOfWeek;
      if (firstDay) setDay(firstDay);
      const review = r.result.entries.filter((e) => e.needsReview).length;
      toast(review ? 'info' : 'success', review ? `Распознано уроков: ${r.result.entries.length}. Проверьте отмеченные: ${review}` : `Распознано уроков: ${r.result.entries.length}`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const validation = useMemo(() => {
    const out = new Map<string, { classBad: boolean; roomBad: boolean }>();
    for (const [k, c] of cells) {
      if (!c.className && !c.roomLabel) continue;
      // Один класс или несколько через запятую («3A, 3B» — например, физкультура)
      const classes = normClass(c.className).split(/[,;/+&]/).filter(Boolean);
      out.set(k, { classBad: !classes.length || !classes.every((x) => CLASS_RE.test(x)), roomBad: !resolveRoom(c.roomLabel) });
    }
    return out;
  }, [cells, roomCodes]);

  const filled = [...cells.entries()].filter(([, c]) => c.className || c.roomLabel);
  const reviewCount = filled.filter(([k, c]) => c.needsReview || validation.get(k)?.classBad || validation.get(k)?.roomBad).length;
  const dirty = useMemo(() => {
    const a = JSON.stringify([...cells].filter(([, c]) => c.className || c.roomLabel).map(([k, c]) => [k, c.className, c.roomLabel]).sort());
    const b = JSON.stringify([...original].map(([k, c]) => [k, c.className, c.roomLabel]).sort());
    return a !== b;
  }, [cells, original]);

  const save = async () => {
    const bad = filled.filter(([k]) => validation.get(k)?.classBad || validation.get(k)?.roomBad);
    if (bad.length) {
      const [k] = bad[0]!;
      setDay(Number(k.split(':')[0]));
      toast('error', 'Исправьте ячейки, отмеченные красным: класс (например, 10A) и кабинет из списка помещений');
      return;
    }
    setBusy('save');
    setErrors([]);
    try {
      await api.put(`${base}/timetable`, {
        entries: filled.map(([k, c]) => {
          const [d, l] = k.split(':').map(Number);
          return { dayOfWeek: d, lessonNumber: l, className: normClass(c.className), roomLabel: resolveRoom(c.roomLabel) ?? c.roomLabel };
        }),
        sourceFileId: ocr?.sourceFileId ?? null,
        ocrReport: ocr ? { method: ocr.result.method, warnings: ocr.result.warnings, reviewed: reviewCount, recognized: ocr.result.entries.length } : null,
      });
      toast('success', 'Расписание сохранено');
      setOcr(null);
      await load();
      onSaved?.();
    } catch (e) {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as (string | { message: string })[]).map((d) => (typeof d === 'string' ? d : d.message)) : [];
      setErrors(details.length ? details : [(e as Error).message]);
      toast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <PageLoader />;
  const days = data.schoolDays.filter((d) => d <= 6);
  const lessons = [...data.lessons].sort((a, b) => a.number - b.number);
  const countByDay = (d: number) => filled.filter(([k]) => k.startsWith(`${d}:`)).length;
  const reviewByDay = (d: number) => filled.filter(([k, c]) => k.startsWith(`${d}:`) && (c.needsReview || validation.get(k)?.classBad || validation.get(k)?.roomBad)).length;

  return (
    <div className="space-y-5">
      {/* Загрузка файла */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void recognize(f);
        }}
        className={`card relative overflow-hidden border-2 border-dashed p-5 transition ${drag ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-white/10'}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept={`${FILE_ACCEPT},application/pdf`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void recognize(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            {busy === 'ocr' ? <ScanText className="h-6 w-6 animate-pulse" /> : <FileUp className="h-6 w-6" />}
          </div>
          <div className="flex-1">
            <div className="font-semibold">{busy === 'ocr' ? 'Распознаём расписание…' : 'Загрузить фото или PDF расписания'}</div>
            <div className="text-sm text-slate-500">
              {busy === 'ocr'
                ? 'Ищем таблицу, дни недели, классы и кабинеты. Обычно 5–30 секунд.'
                : 'PDF (в т.ч. многостраничный), фото или скриншот: PNG, JPG, HEIC (iPhone), WEBP, TIFF, BMP, GIF. Большие фото уменьшаются автоматически. Результат можно проверить и исправить перед сохранением.'}
            </div>
          </div>
          <Button onClick={() => fileRef.current?.click()} loading={busy === 'ocr'} icon={<ImageIcon className="h-4 w-4" />}>
            Выбрать файл
          </Button>
        </div>
        {busy === 'ocr' && (
          <motion.div className="absolute bottom-0 left-0 h-1 bg-brand-500" initial={{ width: '0%' }} animate={{ width: '92%' }} transition={{ duration: 25, ease: 'easeOut' }} />
        )}
      </div>

      {ocr && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <Alert kind={reviewCount ? 'warning' : 'success'}>
            <div className="font-semibold">
              Предварительный результат: {ocr.result.entries.length} уроков
              {ocr.result.method === 'text-layer' ? ' (текст взят из PDF)' : ocr.result.method === 'mixed' ? ' (PDF + OCR)' : ' (OCR)'}.
            </div>
            <div>
              {reviewCount
                ? `Проверьте ${reviewCount} отмеченн${reviewCount === 1 ? 'ую ячейку' : 'ых ячеек'} — распознавание неуверенное или кабинет не найден в базе.`
                : 'Все значения прочитаны уверенно, но всё равно сверьте с оригиналом.'}{' '}
              Автоматическое распознавание не гарантирует 100% точности.
            </div>
            {ocr.result.warnings.map((w, i) => (
              <div key={i} className="mt-1 text-xs">
                • {w}
              </div>
            ))}
          </Alert>
          {ocr.result.previews.length > 0 && (
            <details className="card overflow-hidden" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Исходный документ (нажмите на ячейку в таблице — она подсветится здесь)</summary>
              <div className="thin-scroll max-h-[60vh] space-y-3 overflow-auto p-3">
                {ocr.result.previews.map((p) => (
                  <div key={p.page} className="relative">
                    <img src={p.dataUrl} alt={`Страница ${p.page}`} className="w-full rounded-xl" />
                    {ocr.result.entries
                      .filter((e) => e.needsReview)
                      .flatMap((e) => [e.classBox, e.roomBox])
                      .filter((b): b is NonNullable<typeof b> => !!b && b.page === p.page)
                      .map((b, i) => (
                        <div key={i} className="absolute rounded border-2 border-amber-400 bg-amber-300/20" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />
                      ))}
                    {focusBox && focusBox.page === p.page && (
                      <motion.div
                        layoutId="focus-box"
                        className="absolute rounded border-[3px] border-brand-500 shadow-[0_0_0_4px_rgba(58,99,246,0.25)]"
                        style={{ left: `${focusBox.x * 100}%`, top: `${focusBox.y * 100}%`, width: `${focusBox.w * 100}%`, height: `${focusBox.h * 100}%` }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </motion.div>
      )}

      {/* Дни недели */}
      {/* Все дни в одну строку без прокрутки; сегодняшний отмечен */}
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const isToday = d === todayDow;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              title={DAY_NAMES[d]}
              className={`relative min-w-0 rounded-xl px-1 py-1.5 text-sm font-semibold transition sm:rounded-2xl sm:py-2.5 ${day === d ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300'} ${isToday && day !== d ? 'ring-2 ring-emerald-400/70' : ''}`}
            >
              {day === d && <motion.span layoutId="day-pill" className="absolute inset-0 rounded-xl bg-brand-600 shadow-lg shadow-brand-600/25 sm:rounded-2xl" />}
              <span className="relative flex flex-col items-center leading-tight sm:flex-row sm:justify-center sm:gap-1.5">
                <span className="lg:hidden">{DAY_SHORT[d]}</span>
                <span className="hidden lg:inline">{DAY_NAMES[d]}</span>
                <span className={`text-[10px] font-medium sm:rounded-full sm:px-1.5 sm:text-[11px] ${day === d ? 'text-white/80 sm:bg-white/25' : 'text-slate-400 sm:bg-slate-100 dark:sm:bg-white/10'}`}>{countByDay(d)}</span>
                {reviewByDay(d) > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 sm:static" />}
              </span>
              {isToday && <span className={`relative block truncate text-[9px] font-bold lowercase sm:text-[10px] ${day === d ? 'text-white/90' : 'text-emerald-500'}`}>Сегодня</span>}
            </button>
          );
        })}
      </div>

      {/* Уроки выбранного дня */}
      <datalist id="rl-rooms">
        {data.rooms.map((r) => (
          <option key={r.id} value={r.code}>
            {r.name} · {r.floor}
          </option>
        ))}
      </datalist>
      <AnimatePresence mode="wait">
        <motion.div key={day} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="card divide-y divide-slate-100 dark:divide-white/5">
          {lessons.map((l) => {
            const c = cells.get(key(day, l.number));
            const v = validation.get(key(day, l.number));
            const review = c?.needsReview;
            return (
              <div key={l.number} className={`space-y-2 px-3 py-3 sm:px-4 ${review ? 'bg-amber-50/70 dark:bg-amber-500/5' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-12 shrink-0 sm:w-20">
                  <div className="text-sm font-bold">{l.number} урок</div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {l.start}–{l.end}
                  </div>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:gap-2 [&_.input]:px-2.5 sm:[&_.input]:px-3.5">
                  <input
                    value={c?.className ?? ''}
                    onChange={(e) => setCell(day, l.number, { className: normClass(e.target.value) })}
                    onFocus={() => setFocusBox(c?.classBox ?? null)}
                    placeholder="Класс"
                    aria-label={`Класс, ${l.number} урок`}
                    className={`input font-semibold uppercase ${v?.classBad ? '!border-rose-400 !ring-rose-500/15' : review && (c?.classConfidence ?? 1) < 0.8 ? '!border-amber-400 ring-4 !ring-amber-400/20' : ''}`}
                  />
                  <input
                    value={c?.roomLabel ?? ''}
                    list="rl-rooms"
                    onChange={(e) => setCell(day, l.number, { roomLabel: e.target.value })}
                    onFocus={() => setFocusBox(c?.roomBox ?? null)}
                    placeholder="Кабинет"
                    aria-label={`Кабинет, ${l.number} урок`}
                    className={`input bg-orange-50/60 font-semibold dark:bg-orange-500/5 ${v?.roomBad ? '!border-rose-400 !ring-rose-500/15' : review && (c?.roomConfidence ?? 1) < 0.8 ? '!border-amber-400 ring-4 !ring-amber-400/20' : ''}`}
                  />
                </div>
                <div className="w-8 shrink-0 sm:w-9">
                  {(c?.className || c?.roomLabel) && (
                    <button onClick={() => setCell(day, l.number, { className: '', roomLabel: '' })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-white/10" title="Очистить урок">
                      <Eraser className="h-4 w-4" />
                    </button>
                  )}
                </div>
                </div>
                {review && (
                  <div className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 sm:pl-[5.75rem] dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{c?.notes.length ? c.notes.join(' · ') : 'Проверьте по оригиналу'}</span>
                  </div>
                )}
                {v?.roomBad && c?.roomLabel ? <div className="text-xs text-rose-600 sm:pl-[5.75rem] dark:text-rose-400">Кабинет «{c.roomLabel}» не найден в схеме школы — выберите из списка</div> : null}
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {errors.length > 0 && (
        <Alert kind="error">
          {errors.slice(0, 6).map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Alert>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
        <div className="mr-auto flex items-center gap-2 text-sm">
          <Badge color="blue">Уроков: {filled.length}</Badge>
          {reviewCount > 0 ? (
            <Badge color="amber">
              <AlertTriangle className="h-3 w-3" /> Проверить: {reviewCount}
            </Badge>
          ) : filled.length > 0 ? (
            <Badge color="green">
              <CheckCircle2 className="h-3 w-3" /> Готово к сохранению
            </Badge>
          ) : null}
          {data.timetable?.confirmedAt && !dirty && (
            <span className="hidden text-xs text-slate-500 sm:inline">
              <Sparkles className="mr-1 inline h-3 w-3" />
              Действует с {new Date(data.timetable.confirmedAt).toLocaleDateString('ru-RU')}
            </span>
          )}
        </div>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Undo2 className="h-4 w-4" />}
            onClick={() => {
              setCells(new Map(original));
              setOcr(null);
            }}
          >
            Отменить
          </Button>
        )}
        <Button onClick={save} loading={busy === 'save'} disabled={!dirty && !ocr} icon={<Save className="h-4 w-4" />}>
          Подтвердить и сохранить
        </Button>
      </div>
    </div>
  );
}
