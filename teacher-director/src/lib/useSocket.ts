import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Role } from './api';

export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';

/**
 * Подключение к Socket.IO с cookie-сессией. Автопереподключение и запрос актуального состояния
 * («sync») после восстановления связи или возврата на вкладку.
 */
export function useSocket(role: Role, handlers: Record<string, (payload: never) => void>, onUnauthorized: () => void, enabled = true) {
  const [connection, setConnection] = useState<Connection>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const unauthRef = useRef(onUnauthorized);
  unauthRef.current = onUnauthorized;

  useEffect(() => {
    if (!enabled) return;
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
  }, [role, enabled]);

  return connection;
}
