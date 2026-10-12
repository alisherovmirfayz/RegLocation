import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import type { AppContext, Role } from './context';
import { readToken, resolveSession } from './auth/sessions';
import { logger } from './lib/logger';

const ROLE_BY_CLIENT: Record<string, Role> = { monitor: 'RECEPTION', director: 'DIRECTOR', teacher: 'TEACHER' };

/**
 * Socket.IO: подключение только с действующей серверной сессией (cookie).
 * Комнаты: live (монитор и директор — полный снимок), directors, teacher:<id> (только собственные данные).
 */
export function attachRealtime(ctx: AppContext, server: HttpServer): IOServer {
  const io = new IOServer(server, {
    path: '/socket.io',
    cors: { origin: ctx.config.allowedOrigins, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !ctx.config.allowedOrigins.includes(origin)) {
        const host = socket.handshake.headers['x-forwarded-host'] ?? socket.handshake.headers.host;
        if (new URL(origin).host !== host) return next(new Error('FORBIDDEN_ORIGIN'));
      }
      const client = String(socket.handshake.auth?.role ?? '');
      const role = ROLE_BY_CLIENT[client];
      if (!role) return next(new Error('UNAUTHORIZED'));
      const auth = await resolveSession(ctx, readToken(ctx, socket.handshake.headers.cookie, role), role);
      if (!auth) return next(new Error('UNAUTHORIZED'));
      socket.data.sessionId = auth.session.id;
      socket.data.userId = auth.user.id;
      socket.data.role = role;
      if (role === 'TEACHER') {
        const t = await ctx.prisma.teacher.findUnique({ where: { userId: auth.user.id }, select: { id: true } });
        if (!t) return next(new Error('UNAUTHORIZED'));
        socket.data.teacherId = t.id;
      }
      next();
    } catch (e) {
      logger.warn('Ошибка авторизации Socket.IO', { err: String(e) });
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const role = socket.data.role as Role;
    const sendState = async () => {
      try {
        if (role === 'TEACHER') socket.emit('teacher:state', await ctx.live.teacherState(socket.data.teacherId));
        else socket.emit('state', await ctx.live.snapshot());
      } catch (e) {
        logger.error('Не удалось отправить состояние', { err: String(e) });
      }
    };
    if (role === 'TEACHER') void socket.join(`teacher:${socket.data.teacherId}`);
    else void socket.join('live');
    if (role === 'DIRECTOR') void socket.join('directors');
    void sendState();
    // Клиент запрашивает актуальное состояние после переподключения или возврата на вкладку
    socket.on('sync', () => void sendState());
  });

  // Периодически отключаем сокеты с истёкшими/отозванными сессиями
  const timer = setInterval(async () => {
    const ids = [...io.sockets.sockets.values()].map((s) => s.data.sessionId as string).filter(Boolean);
    if (!ids.length) return;
    const alive = new Set((await ctx.prisma.session.findMany({ where: { id: { in: ids }, expiresAt: { gt: new Date() } }, select: { id: true } })).map((s) => s.id));
    ctx.live.disconnectSessions(ids.filter((id) => !alive.has(id)));
  }, 60_000);
  timer.unref();
  io.engine.on('close', () => clearInterval(timer));

  ctx.io = io;
  ctx.live.setIO(io);
  return io;
}
