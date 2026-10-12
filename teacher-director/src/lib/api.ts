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
    throw new ApiError(res.status, data.error ?? `Ошибка ${res.status}`, data.code, data.details);
  }
  return data as T;
}

export function client(role: Role) {
  return {
    get: <T>(p: string) => request<T>(role, 'GET', p),
    post: <T>(p: string, b?: unknown) => request<T>(role, 'POST', p, b ?? {}),
    put: <T>(p: string, b?: unknown) => request<T>(role, 'PUT', p, b ?? {}),
    patch: <T>(p: string, b?: unknown) => request<T>(role, 'PATCH', p, b ?? {}),
    del: <T>(p: string) => request<T>(role, 'DELETE', p),
    upload: <T>(p: string, file: File | Blob, field = 'file') => {
      const fd = new FormData();
      fd.append(field, file);
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
