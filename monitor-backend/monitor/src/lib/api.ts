let csrfToken = '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Ошибка соединения с сервером', data.code);
  return data as T;
}

export interface SessionInfo {
  user: { id: string; login: string; firstName: string; lastName: string };
  csrfToken: string;
}

export async function getSession(): Promise<SessionInfo | null> {
  try {
    const s = await api<SessionInfo>('/api/auth/monitor/session');
    csrfToken = s.csrfToken;
    return s;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function login(loginName: string, password: string) {
  const s = await api<SessionInfo>('/api/auth/monitor/login', { method: 'POST', body: { login: loginName, password } });
  csrfToken = s.csrfToken;
  return s;
}

export async function logout() {
  await api('/api/auth/monitor/logout', { method: 'POST' }).catch(() => undefined);
}
