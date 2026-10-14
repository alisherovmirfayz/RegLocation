import { getLang, setLang, type Lang } from '../lib/i18n';

/** Переключатель языка интерфейса: русский / узбекский. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = getLang();
  return (
    <div data-no-i18n className={`flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold dark:bg-white/10 ${className}`} role="group" aria-label="Til / Язык">
      {(['ru', 'uz'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => l !== lang && setLang(l)}
          aria-pressed={l === lang}
          className={`rounded-[10px] px-2 py-1 transition ${l === lang ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
