import { Send } from 'lucide-react';

/** Подпись автора сайта с контактом в Telegram. */
export function MadeBy({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 ${className}`}>
      <span>Сайт сделал Мирфайз</span>
      <span aria-hidden>·</span>
      <a
        href="https://t.me/m1_r1k"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-brand-500 hover:text-brand-600 hover:underline dark:text-brand-300"
        data-no-i18n
      >
        <Send className="h-3 w-3" /> Telegram @m1_r1k
      </a>
    </div>
  );
}
