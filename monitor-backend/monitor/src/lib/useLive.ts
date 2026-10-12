import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError } from './api';
import type { Snapshot } from './types';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface LiveEvent {
  id: number;
  at: number;
  kind: 'arrive' | 'leave' | 'move' | 'period' | 'info';
  text: string;
}

const describeEvents = (prev: Snapshot, next: Snapshot, makeId: () => number): LiveEvent[] => {
  const out: LiveEvent[] = [];
  const now = Date.now();
  if (prev.period.kind !== next.period.kind || prev.period.lessonNumber !== next.period.lessonNumber) {
    const p = next.period;
    const text =
      p.kind === 'MEAL' ? `Начался ${p.mealKey === 'snack' ? 'полдник' : 'обед'} — учителя в столовой` :
      p.kind === 'LESSON' ? `Начался ${p.lessonNumber}-й урок` :
      p.kind === 'DAY_ENDED' ? 'Учебный день завершён' :
      p.kind === 'BREAK' ? 'Перемена' : p.title;
    out.push({ id: makeId(), at: now, kind: 'period', text });
  }
  const prevById = new Map(prev.teachers.map((t) => [t.id, t]));
  for (const t of next.teachers) {
    const p = prevById.get(t.id);
    const name = `${t.lastName} ${t.firstName.slice(0, 1)}.`;
    if (!p) continue;
    if (!p.present && t.present) out.push({ id: makeId(), at: now, kind: 'arrive', text: `${name} в школе` });
    else if (p.present && !t.present && next.period.kind !== 'DAY_ENDED') out.push({ id: makeId(), at: now, kind: 'leave', text: `${name} вышел(а) из школы` });
    else if (t.present && t.location.reason === 'MANUAL' && p.location.roomId !== t.location.roomId) {
      out.push({ id: makeId(), at: now, kind: 'move', text: `${name}: ${p.location.roomName ?? '—'} → ${t.location.roomName ?? '—'}` });
    }
  }
  // Не засоряем ленту при массовых изменениях (обед, конец дня)
  return out.length > 6 ? out.filter((e) => e.kind === 'period') : out;
};

/**
 * Подписка на состояние монитора через Socket.IO.
 * При обрыве связи — автоматическое переподключение и запрос актуального снимка; резервный HTTP-опрос.
 */
export function useLive(onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const prevRef = useRef<Snapshot | null>(null);
  const idRef = useRef(1);
  const socketRef = useRef<Socket | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    const apply = (s: Snapshot) => {
      const prev = prevRef.current;
      if (prev && prev.hash !== s.hash) {
        const evs = describeEvents(prev, s, () => idRef.current++);
        if (evs.length) setEvents((list) => [...evs, ...list].slice(0, 5));
      }
      prevRef.current = s;
      setSnapshot(s);
      setReceivedAt(Date.now());
    };

    const socket = io({ path: '/socket.io', auth: { role: 'monitor' }, withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnection('online');
      socket.emit('sync');
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));
    socket.io.on('reconnect_failed', () => setConnection('offline'));
    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') unauthorizedRef.current();
      else setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    });
    socket.on('state', apply);
    socket.on('session:revoked', () => unauthorizedRef.current());

    // Резервный опрос, если WebSocket недоступен
    const poll = setInterval(async () => {
      if (socket.connected) return;
      try {
        apply(await api<Snapshot>('/api/monitor/snapshot'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) unauthorizedRef.current();
      }
    }, 30_000);

    const resync = () => {
      if (document.visibilityState === 'visible') {
        if (socket.connected) socket.emit('sync');
        else socket.connect();
      }
    };
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', resync);
    return () => {
      clearInterval(poll);
      window.removeEventListener('online', resync);
      document.removeEventListener('visibilitychange', resync);
      socket.close();
    };
  }, []);

  // Удаляем старые события через 25 секунд
  useEffect(() => {
    if (!events.length) return;
    const t = setTimeout(() => setEvents((list) => list.filter((e) => Date.now() - e.at < 25_000)), 5_000);
    return () => clearTimeout(t);
  }, [events]);

  return { snapshot, connection, events, receivedAt };
}
