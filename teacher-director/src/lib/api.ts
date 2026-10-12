export type Role = 'teacher' | 'director';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { path?: string; message: string }[] | string[],
  ) {
    super(message);
  }
}

const csrf: Record<Role, string> = { teacher: '', director: '' };
const unauthorizedHandlers: Record<Role, (() => void) | null> = { teacher: null, director: null };

export function setCsrf(role: Role, token: string) {
  csrf[role] = token;
}
export function onUnauthorized(role: Role, fn: () => void) {
  unauthorizedHandlers[role] = fn;
}

async function request<T>(role: Role, method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': csrf[role] } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером. Проверьте интернет.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/login') && !path.includes('/session')) unauthorizedHandlers[role]?.();
    const fallback = res.status === 413 ? 'Файл слишком большой. Уменьшите его или сохраните как JPG/PDF меньшего размера.' : `Ошибка ${res.status}`;
    throw new ApiError(res.status, data.error ?? fallback, data.code, data.details);
  }
  // Данные изменены — при обновлениях опросом страница запрашивает новое состояние сразу
  if (method !== 'GET') window.dispatchEvent(new Event('rl:changed'));
  return data as T;
}

export interface RuntimeInfo {
  realtime: 'socket' | 'poll';
  maxUploadMb: number;
}
let runtime: Promise<RuntimeInfo> | null = null;
/** Возможности сервера: способ обновлений (Socket.IO или опрос на Vercel) и допустимый размер файла. */
export function runtimeInfo(): Promise<RuntimeInfo> {
  runtime ??= fetch('/api/public/runtime', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((r: Partial<RuntimeInfo>) => ({ realtime: r.realtime === 'poll' ? 'poll' : 'socket', maxUploadMb: Number(r.maxUploadMb) || 15 }) as RuntimeInfo)
    .catch(() => ({ realtime: 'socket', maxUploadMb: 15 }) as RuntimeInfo);
  return runtime;
}

/**
 * Если файл больше допустимого (на Vercel — 4 МБ), фото уменьшается в браузере до 3000 px по длинной стороне
 * и сохраняется в JPEG: текст расписания остаётся читаемым. PDF и HEIC уменьшить в браузере нельзя — понятная ошибка.
 */
async function fitForUpload(file: File | Blob): Promise<File | Blob> {
  const { maxUploadMb } = await runtimeInfo();
  const max = maxUploadMb * 1024 * 1024;
  if (file.size <= max) return file;
  const name = file instanceof File ? file.name : 'image';
  const tooBig = new ApiError(413, `Файл больше ${maxUploadMb} МБ. Сделайте скриншот или сохраните расписание как JPG/PDF меньшего размера.`);
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type)) throw tooBig;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw tooBig;
  }
  for (const [side, quality] of [[3000, 0.92], [2400, 0.88], [2000, 0.82]] as const) {
    const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * k);
    canvas.height = Math.round(bitmap.height * k);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (blob && blob.size <= max) return new File([blob], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }
  throw tooBig;
}

export function client(role: Role) {
  return {
    get: <T>(p: string) => request<T>(role, 'GET', p),
    post: <T>(p: string, b?: unknown) => request<T>(role, 'POST', p, b ?? {}),
    put: <T>(p: string, b?: unknown) => request<T>(role, 'PUT', p, b ?? {}),
    patch: <T>(p: string, b?: unknown) => request<T>(role, 'PATCH', p, b ?? {}),
    del: <T>(p: string) => request<T>(role, 'DELETE', p),
    upload: async <T>(p: string, file: File | Blob, field = 'file') => {
      const fd = new FormData();
      const ready = await fitForUpload(file);
      fd.append(field, ready, ready instanceof File ? ready.name : (file as File).name ?? 'file');
      return request<T>(role, 'POST', p, fd, true);
    },
  };
}

export const teacherApi = client('teacher');
export const directorApi = client('director');

export interface SessionUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
}
export interface SessionInfo {
  user: SessionUser;
  csrfToken: string;
  isOwner?: boolean;
  teacherId?: string;
}

export async function loadSession(role: Role): Promise<SessionInfo | null> {
  try {
    const s = await client(role).get<SessionInfo>(`/api/auth/${role}/session`);
    setCsrf(role, s.csrfToken);
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function login(role: Role, loginName: string, password: string) {
  const s = await client(role).post<SessionInfo>(`/api/auth/${role}/login`, { login: loginName, password });
  setCsrf(role, s.csrfToken);
  return s;
}

export async function logout(role: Role) {
  await client(role).post(`/api/auth/${role}/logout`).catch(() => undefined);
  setCsrf(role, '');
}
