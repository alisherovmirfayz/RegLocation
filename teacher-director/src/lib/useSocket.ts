import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ApiError, client, runtimeInfo, type Role } from './api';

export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';
type Handlers = Record<string, (payload: never) => void>;

interface PollState {
  period?: { kind: string };
  clock?: { minutes: number; simulated?: boolean };
  day?: { isSchoolDay: boolean };
}

/** Учебное время — частый опрос; ночью, в выходные и в скрытой вкладке — редкий (бесплатная база успевает «уснуть»). */
function pollDelay(s: PollState | null): number {
  if (document.visibilityState !== 'visible') return 60_000;
  if (!s?.period || !s.clock) return 5_000;
  const quiet = s.period.kind === 'DAY_ENDED' || s.period.kind === 'DAY_OFF' || s.day?.isSchoolDay === false || s.clock.minutes < 6 * 60 + 30;
  return quiet && !s.clock.simulated ? 30 * 60_000 : 5_000;
}

/**
 * Обновления опросом (хостинг без постоянных соединений, Vercel). Вызывает те же обработчики,
 * что и события Socket.IO: state, teacher:state, audit:new, structure:changed.
 */
function startPolling(role: Role, handlers: { current: Handlers }, setConnection: (c: Connection) => void, onUnauthorized: () => void) {
  const api = client(role);
  let hash = '';
  let after = '';
  let version: number | null = null;
  let last: PollState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    try {
      const r = await api.get<{ hash: string; state: PollState | null; version?: number; audits?: unknown[]; auditCursor?: string }>(
        `/api/realtime/poll?role=${role}&hash=${hash}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      );
      hash = r.hash;
      if (r.state) {
        last = r.state;
        handlers.current[role === 'teacher' ? 'teacher:state' : 'state']?.(r.state as never);
      }
      for (const a of r.audits ?? []) handlers.current['audit:new']?.(a as never);
      if (r.auditCursor) after = r.auditCursor;
      if (r.version !== undefined) {
        if (version !== null && r.version !== version) handlers.current['structure:changed']?.({} as never);
        version = r.version;
      }
      setConnection('online');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onUnauthorized();
      setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    }
    if (!stopped) timer = setTimeout(tick, pollDelay(last));
  };
  const wake = () => {
    if (document.visibilityState === 'visible') void tick();
  };
  window.addEventListener('online', wake);
  window.addEventListener('rl:changed', wake);
  document.addEventListener('visibilitychange', wake);
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', wake);
    window.removeEventListener('rl:changed', wake);
    document.removeEventListener('visibilitychange', wake);
  };
}


/**
 * Подключение к Socket.IO с cookie-сессией. Автопереподключение и запрос актуального состояния
 * («sync») после восстановления связи или возврата на вкладку. На Vercel — опрос с теми же событиями.
 */
export function useSocket(role: Role, handlers: Handlers, onUnauthorized: () => void, enabled = true) {
  const [connection, setConnection] = useState<Connection>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const unauthRef = useRef(onUnauthorized);
  unauthRef.current = onUnauthorized;

  useEffect(() => {
    if (!enabled) return;
    let cleanup: (() => void) | null = null;
    let disposed = false;
    void runtimeInfo().then(({ realtime }) => {
      if (disposed) return;
      cleanup = realtime === 'poll' ? startPolling(role, handlersRef, setConnection, () => unauthRef.current()) : startSocket();
    });

    function startSocket() {
      const socket: Socket = io({ path: '/socket.io', auth: { role }, withCredentials: true, transports: ['websocket', 'polling'] });
      socket.on('connect', () => {
        setConnection('online');
        socket.emit('sync');
      });
      socket.on('disconnect', () => setConnection('reconnecting'));
      socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));
      socket.on('connect_error', (e) => (e.message === 'UNAUTHORIZED' ? unauthRef.current() : setConnection(navigator.onLine ? 'reconnecting' : 'offline')));
      socket.on('session:revoked', () => unauthRef.current());
      socket.onAny((event: string, payload: unknown) => handlersRef.current[event]?.(payload as never));
      const resync = () => {
        if (document.visibilityState !== 'visible') return;
        if (socket.connected) socket.emit('sync');
        else socket.connect();
      };
      window.addEventListener('online', resync);
      document.addEventListener('visibilitychange', resync);
      return () => {
        window.removeEventListener('online', resync);
        document.removeEventListener('visibilitychange', resync);
        socket.close();
      };
    }

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [role, enabled]);

  return connection;
}
