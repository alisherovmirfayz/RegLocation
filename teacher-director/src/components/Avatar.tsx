import { useState } from 'react';

const GRADIENTS = [
  'from-sky-400 to-blue-600',
  'from-indigo-400 to-violet-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-fuchsia-400 to-purple-600',
  'from-lime-400 to-green-600',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  url,
  size = 40,
  className = '',
  ring = true,
}: {
  name: { firstName: string; lastName: string; id?: string };
  url: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = `${name.lastName[0] ?? ''}${name.firstName[0] ?? ''}`.toUpperCase();
  const g = GRADIENTS[hash(name.id ?? name.lastName + name.firstName) % GRADIENTS.length];
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/90 dark:ring-white/70 shadow-lg shadow-black/25' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${g} font-semibold text-white`} style={{ fontSize: size * 0.38 }}>
          {initials}
        </div>
      )}
    </div>
  );
}
