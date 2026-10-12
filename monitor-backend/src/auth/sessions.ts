import type { Request, Response, NextFunction } from 'express';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Session, User } from '@prisma/client';
import type { AppContext, Role } from '../context';
import { randomToken, safeEqual, sha256 } from '../lib/credentials';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthInfo {
  session: Session;
  user: User;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
  }
}

const BASE_NAMES: Record<Role, string> = {
  DIRECTOR: 'rl_director',
  TEACHER: 'rl_teacher',
  RECEPTION: 'rl_monitor',
};

/** Отдельная cookie для каждой роли, чтобы на одном устройстве можно было войти и как учитель, и как директор. */
export function cookieName(ctx: AppContext, role: Role): string {
  const base = BASE_NAMES[role];
  return ctx.config.cookieSecure && !ctx.config.COOKIE_DOMAIN ? `__Host-${base}` : base;
}

function ttlHours(ctx: AppContext, role: Role) {
  return role === 'RECEPTION' ? ctx.config.MONITOR_SESSION_TTL_HOURS : ctx.config.SESSION_TTL_HOURS;
}

function setCookie(ctx: AppContext, res: Response, role: Role, value: string, maxAgeSec: number) {
  res.append(
    'Set-Cookie',
    stringifySetCookie({
      name: cookieName(ctx, role),
      value,
      httpOnly: true,
      secure: ctx.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSec,
      domain: ctx.config.COOKIE_DOMAIN || undefined,
    }),
  );
}

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? '').slice(0, 64);
}

export async function createSession(ctx: AppContext, req: Request, res: Response, user: User, role: Role) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const hours = ttlHours(ctx, role);
  const session = await ctx.prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      role,
      csrfToken,
      ip: clientIp(req),
      userAgent: (req.get('user-agent') ?? '').slice(0, 300),
      expiresAt: new Date(Date.now() + hours * 3600_000),
    },
  });
  setCookie(ctx, res, role, token, hours * 3600);
  return session;
}

export function clearSessionCookie(ctx: AppContext, res: Response, role: Role) {
  setCookie(ctx, res, role, '', 0);
}

export function readToken(ctx: AppContext, cookieHeader: string | undefined, role: Role): string | null {
  if (!cookieHeader) return null;
  const cookies = parseCookie(cookieHeader);
  return cookies[cookieName(ctx, role)] || null;
}

/** Проверяет токен сессии; возвращает null, если сессия недействительна. */
export async function resolveSession(ctx: AppContext, token: string | null, role: Role): Promise<AuthInfo | null> {
  if (!token || token.length > 200) return null;
  const session = await ctx.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.role !== role) return null;
  if (session.expiresAt <= new Date()) {
    await ctx.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.status !== 'ACTIVE' || session.user.role !== role) return null;
  // Скользящее продление: не чаще раза в 10 минут
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000) {
    const expiresAt = new Date(Date.now() + ttlHours(ctx, role) * 3600_000);
    await ctx.prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt } })
      .catch(() => undefined);
  }
  const { user, ...s } = session;
  return { session: s as Session, user, role };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Middleware: требует сессию указанной роли и (для изменяющих запросов) корректный CSRF-токен. */
export function requireRole(ctx: AppContext, role: Role) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = await resolveSession(ctx, readToken(ctx, req.headers.cookie, role), role);
      if (!auth) throw unauthorized();
      if (!SAFE_METHODS.has(req.method)) {
        const header = req.get('x-csrf-token') ?? '';
        if (!header || !safeEqual(header, auth.session.csrfToken)) throw forbidden('Недействительный CSRF-токен. Обновите страницу.');
      }
      req.auth = auth;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Любая роль из списка (для чтения файлов). */
export async function resolveAnyRole(ctx: AppContext, req: Request, roles: Role[]): Promise<AuthInfo | null> {
  for (const role of roles) {
    const a = await resolveSession(ctx, readToken(ctx, req.headers.cookie, role), role);
    if (a) return a;
  }
  return null;
}

/**
 * Проверка Origin для изменяющих запросов: защита от CSRF второго уровня.
 * Браузер всегда отправляет Origin для POST/PUT/PATCH/DELETE.
 */
export function originGuard(ctx: AppContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const host = req.get('x-forwarded-host') ?? req.get('host');
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === host;
    } catch {
      /* noop */
    }
    if (sameHost || ctx.config.allowedOrigins.includes(origin)) return next();
    next(forbidden('Запрос с недопустимого источника'));
  };
}

export async function revokeUserSessions(ctx: AppContext, userId: string, exceptSessionId?: string) {
  const sessions = await ctx.prisma.session.findMany({ where: { userId, NOT: exceptSessionId ? { id: exceptSessionId } : undefined }, select: { id: true } });
  await ctx.prisma.session.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
  ctx.live.disconnectSessions(sessions.map((s) => s.id));
  return sessions.length;
}
