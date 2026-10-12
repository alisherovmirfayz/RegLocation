import { motion } from 'motion/react';
import { TimetableEditor } from '../components/TimetableEditor';

export function TeacherSchedule({ onSaved }: { onSaved: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <h1 className="mb-1 text-2xl font-bold">Расписание</h1>
      <p className="mb-5 text-sm text-slate-500">
        Загрузите фото или PDF своего расписания — система найдёт классы (белые ячейки) и кабинеты (оранжевые ячейки). Проверьте результат и сохраните.
      </p>
      <TimetableEditor role="teacher" base="/api/teacher" onSaved={onSaved} />
    </motion.div>
  );
}
