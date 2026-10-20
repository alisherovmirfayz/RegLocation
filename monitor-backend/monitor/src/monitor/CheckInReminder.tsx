
import { AnimatePresence, motion } from 'motion/react';
import { BellRing } from 'lucide-react';
import { useTeacherQr } from './TeacherQr';
import type { Snapshot } from '../lib/types';

const SHOW_EVERY_MIN = 2;
const SHOW_FOR_SEC = 10;

const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h! * 60 + m!;
};

/**
 * Утром, от начала учебного дня (08:00) до первого урока (09:00), каждые 2 минуты на 10 секунд монитор напоминает учителям
 * отметиться «Я в школе» и показывает QR-код на сайт учителя.
 */
export function CheckInReminder({ snapshot, minutes, seconds }: { snapshot: Snapshot; minutes: number; seconds: number }) {
  const { url, svg } = useTeacherQr();

  const day = snapshot.day;
  const firstLesson = day?.lessons.length ? Math.min(...day.lessons.map((l) => toMin(l.start))) : null;
  const inWindow = !!day?.isSchoolDay && firstLesson !== null && minutes >= toMin(day.startOfDay ?? '08:00') && minutes < firstLesson;
  // Не закрывает схему всё утро: появляется каждые 2 минуты на 10 секунд
  const visible = inWindow && (minutes * 60 + seconds) % (SHOW_EVERY_MIN * 60) < SHOW_FOR_SEC;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-20 z-40 flex justify-center px-4">
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          className="flex w-full max-w-[460px] flex-col items-center gap-4 rounded-3xl border border-brand-300/60 bg-white/95 px-8 py-6 text-center shadow-2xl backdrop-blur dark:border-brand-400/30 dark:bg-slate-900/95"
        >
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
            <BellRing className="h-6 w-6 animate-pulse" />
            <span className="text-2xl font-bold">Дорогие учителя!</span>
          </div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Не забудьте нажать кнопку «Я в школе»</p>
          {svg && <div className="h-48 w-48 overflow-hidden rounded-2xl bg-white p-2 shadow-inner [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <div>Наведите камеру телефона на QR-код</div>
            <div className="font-semibold text-slate-700 dark:text-slate-200" data-no-i18n>
              {url.replace(/^https?:\/\//, '')}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
