import { useEffect, useState } from 'react';

/**
 * Логотип школы — оригинальное изображение без перерисовки.
 * Источник: логотип, загруженный директором (/api/public/logo), иначе файл /brand/logo.jpg из сборки.
 * Скругление углов — CSS border-radius (класс .brand-logo).
 */
export function Logo({ size = 40, withText = true, subtitle, version }: { size?: number; withText?: boolean; subtitle?: string; version?: string | number }) {
  const [src, setSrc] = useState(`/api/public/logo${version ? `?v=${version}` : ''}`);
  useEffect(() => setSrc(`/api/public/logo${version ? `?v=${version}` : ''}`), [version]);
  return (
    <div className="flex items-center gap-3 select-none">
      <img
        src={src}
        onError={() => setSrc('/brand/logo.jpg')}
        alt="Логотип школы"
        width={size}
        height={size}
        className="brand-logo shrink-0"
        style={{ width: size, height: size }}
        draggable={false}
      />
      {withText && (
        <div className="leading-tight">
          <div className="font-semibold tracking-tight text-slate-900 dark:text-white" style={{ fontSize: size * 0.48 }}>
            Reg<span className="text-brand-600 dark:text-brand-300">Location</span>
          </div>
          {subtitle && <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
