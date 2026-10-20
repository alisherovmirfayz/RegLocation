import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../lib/api';

/** Адрес сайта учителя (с сервера; запасной вариант — тот же домен, что у монитора) и QR-код на него (SVG). */
export function useTeacherQr() {
  const [url, setUrl] = useState(`${window.location.origin}/teacher`);
  const [svg, setSvg] = useState('');
  useEffect(() => {
    api<{ teacherUrl?: string }>('/api/public/runtime')
      .then((r) => r.teacherUrl && setUrl(r.teacherUrl))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [url]);
  return { url, svg };
}

/** Через сколько окно с QR-кодом закрывается само (монитор не остаётся закрытым надолго) */
const AUTO_CLOSE_MS = 60_000;

/** Кнопка «QR» в шапке монитора: крупный QR-код на сайт учителя. */
export function TeacherQrButton() {
  const { url, svg } = useTeacherQr();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:text-brand-600 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
        title="QR-код на сайт учителя"
      >
        <QrCode className="h-5 w-5" /> QR
      </button>
      {/* В корень страницы: у шапки размытие фона, внутри неё fixed-окно обрезалось бы */}
      {createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 160, damping: 20 }}
              className="relative flex w-full max-w-[520px] flex-col items-center gap-5 rounded-3xl bg-white px-10 py-8 text-center shadow-2xl dark:bg-slate-900"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">Сайт учителя</div>
              {svg && <div className="h-80 w-80 overflow-hidden rounded-2xl bg-white p-3 shadow-inner [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
              <div className="text-base text-slate-500 dark:text-slate-400">Наведите камеру телефона на QR-код</div>
              <div className="text-lg font-semibold text-slate-800 dark:text-slate-100" data-no-i18n>
                {url.replace(/^https?:\/\//, '')}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
