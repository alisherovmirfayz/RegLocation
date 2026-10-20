import { Send } from 'lucide-react';

/** Подпись автора сайта с контактом в Telegram (только текст). */
export function MadeBy({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 ${className}`}>
      <span>Сайт сделал Мирфайз</span>
      <span aria-hidden>·</span>
      {/* Только для просмотра — без ссылки */}
      <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400" data-no-i18n>
        <Send className="h-3 w-3" /> Telegram @m1_r1k
      </span>
    </div>
  );
}
