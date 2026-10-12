import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppContext, Role } from '../context';
import { ah, badRequest, conflict, HttpError, parse, unauthorized } from '../lib/errors';
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from '../lib/passwords';
import { generateNumericCode, safeEqual, sha256 } from '../lib/credentials';
import { clearSessionCookie, clientIp, createSession, readToken, requireRole, resolveSession, revokeUserSessions } from '../auth/sessions';
import { codeEmail } from '../lib/mail';
import { audit } from '../lib/audit';
import { logger } from '../lib/logger';

const ROLE_BY_PATH: Record<string, Role> = { director: 'DIRECTOR', teacher: 'TEACHER', monitor: 'RECEPTION' };

const LoginSchema = z.object({
  login: z.string().trim().min(1, 'Введите логин').max(64),
  password: z.string().min(1, 'Введите пароль').max(256),
});

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const CODE_TTL_MIN = 15;
const MAX_CODE_ATTEMPTS = 5;

const codeHash = (id: string, code: string) => sha256(`${id}:${code}`);

export function publicUser(user: { id: string; login: string; firstName: string; lastName: string; email?: string | null; role: Role }) {
  return { id: user.id, login: user.login, firstName: user.firstName, lastName: user.lastName, email: user.email ?? null, role: user.role };
}

async function sessionPayload(ctx: AppContext, role: Role, userId: string) {
  if (role === 'DIRECTOR') {
    const d = await ctx.prisma.director.findUnique({ where: { userId } });
    return { isOwner: d?.isOwner ?? false };
  }
  if (role === 'TEACHER') {
    const t = await ctx.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    return { teacherId: t?.id ?? null };
  }
  return {};
}

export function authRouter(ctx: AppContext): Router {
  const r = Router();
  const testEnv = ctx.config.NODE_ENV === 'test';

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: testEnv ? 1000 : 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${clientIp(req)}:${req.params.role ?? ''}`,
    message: { error: 'Слишком много попыток входа. Попробуйте позже.', code: 'RATE_LIMITED' },
  });
  const codeLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: testEnv ? 1000 : 8,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: 'Слишком много запросов кода. Попробуйте через час.', code: 'RATE_LIMITED' },
  });

  const roleOf = (req: Request): Role => {
    const role = ROLE_BY_PATH[String(req.params.role)];
    if (!role) throw new HttpError(404, 'Не найдено', 'NOT_FOUND');
    return role;
  };

  // ───────── Вход / выход / текущая сессия ─────────

  r.post(
    '/:role/login',
    loginLimiter,
    ah(async (req, res) => {
      const role = roleOf(req);
      const { login, password } = parse(LoginSchema, req.body);
      const user = await ctx.prisma.user.findUnique({ where: { login: login.toLowerCase() } });
      if (!user || user.role !== role) {
        await burnPasswordCheck(password);
        throw unauthorized('Неверный логин или пароль');
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        throw new HttpError(429, `Слишком много неудачных попыток. Повторите через ${minutes} мин.`, 'LOCKED');
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        const failed = user.failedLogins + 1;
        await ctx.prisma.user.update({
          where: { id: user.id },
          data: failed >= LOCK_AFTER ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
        });
        throw unauthorized('Неверный логин или пароль');
      }
      if (user.status !== 'ACTIVE') {
        throw new HttpError(403, user.status === 'BLOCKED' ? 'Аккаунт заблокирован. Обратитесь к директору.' : 'Аккаунт в архиве.', 'ACCOUNT_DISABLED');
      }
      await ctx.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      const session = await createSession(ctx, req, res, user, role);
      if (role === 'TEACHER') void ctx.live.changed();
      res.json({ user: publicUser(user), csrfToken: session.csrfToken, ...(await sessionPayload(ctx, role, user.id)) });
    }),
  );

  r.get(
    '/:role/session',
    ah(async (req, res) => {
      const role = roleOf(req);
      const auth = await resolveSession(ctx, readToken(ctx, req.headers.cookie, role), role);
      if (!auth) throw unauthorized();
      res.set('Cache-Control', 'no-store');
      res.json({ user: publicUser(auth.user), csrfToken: auth.session.csrfToken, ...(await sessionPayload(ctx, role, auth.user.id)) });
    }),
  );

  r.post(
    '/:role/logout',
    (req, res, next) => requireRole(ctx, roleOf(req))(req, res, next),
    ah(async (req, res) => {
      await ctx.prisma.session.delete({ where: { id: req.auth!.session.id } }).catch(() => undefined);
      ctx.live.disconnectSessions([req.auth!.session.id]);
      clearSessionCookie(ctx, res, req.auth!.role);
      if (req.auth!.role === 'TEACHER') void ctx.live.changed();
      res.json({ ok: true });
    }),
  );

  // ───────── Первичная регистрация владельца (директора) ─────────

  const RegisterSchema = z
    .object({
      firstName: z.string().trim().min(1, 'Введите имя').max(60),
      lastName: z.string().trim().min(1, 'Введите фамилию').max(60),
      login: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, 'Логин — минимум 3 символа')
        .max(32)
        .regex(/^[a-z0-9._-]+$/, 'Логин: только латинские буквы, цифры, точка, дефис и подчёркивание'),
      email: z.string().trim().toLowerCase().email('Введите корректный email'),
      password: z.string().max(128),
      passwordConfirm: z.string(),
    })
    .superRefine((v, c) => {
      const p = passwordProblems(v.password);
      if (p) c.addIssue({ code: 'custom', message: p, path: ['password'] });
      if (v.password !== v.passwordConfirm) c.addIssue({ code: 'custom', message: 'Пароли не совпадают', path: ['passwordConfirm'] });
    });

  const ownerRegistered = async () => {
    const s = await ctx.prisma.systemState.findUnique({ where: { id: 1 } });
    return !!s?.ownerDirectorId;
  };

  r.post(
    '/director/register/start',
    codeLimiter,
    ah(async (req, res) => {
      if (await ownerRegistered()) throw conflict('Аккаунт директора уже создан. Используйте вход директора.');
      const initial = ctx.config.INITIAL_DIRECTOR_EMAIL?.toLowerCase();
      if (!initial) throw new HttpError(503, 'Регистрация недоступна: администратор хостинга не указал email владельца.', 'NOT_CONFIGURED');
      if (!ctx.mailer.configured) throw new HttpError(503, 'Регистрация недоступна: не настроен почтовый сервис.', 'MAIL_NOT_CONFIGURED');
      const data = parse(RegisterSchema, req.body);
      if (await ctx.prisma.user.findUnique({ where: { login: data.login } })) throw conflict('Этот логин уже занят');

      // Одинаковый ответ для любого email: не раскрываем, какой адрес указан как email владельца.
      const message = 'Если этот email указан как email владельца, на него отправлен код подтверждения.';
      if (data.email !== initial) {
        await burnPasswordCheck(data.password);
        logger.warn('Попытка регистрации директора с неразрешённым email', { ip: clientIp(req) });
        res.json({ verificationId: crypto.randomUUID(), message });
        return;
      }
      const code = generateNumericCode(6);
      const passwordHash = await hashPassword(data.password);
      const id = crypto.randomUUID();
      await ctx.prisma.emailVerification.create({
        data: {
          id,
          purpose: 'OWNER_REGISTRATION',
          email: data.email,
          codeHash: codeHash(id, code),
          payload: { firstName: data.firstName, lastName: data.lastName, login: data.login, passwordHash },
          expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
          ip: clientIp(req),
        },
      });
      await ctx.mailer.send({ to: data.email, ...codeEmail('подтверждение регистрации директора', 'Вы регистрируете основной аккаунт директора в RegLocation.', code) });
      res.json({ verificationId: id, message });
    }),
  );

  const VerifySchema = z.object({ verificationId: z.string().uuid('Неверный запрос'), code: z.string().trim().regex(/^\d{6}$/, 'Код — 6 цифр') });

  async function consumeCode(id: string, code: string, purpose: 'OWNER_REGISTRATION' | 'DIRECTOR_PASSWORD_RECOVERY') {
    const v = await ctx.prisma.emailVerification.findUnique({ where: { id } });
    const invalid = () => badRequest('Неверный или просроченный код');
    if (!v || v.purpose !== purpose || v.consumedAt || v.expiresAt < new Date()) throw invalid();
    if (v.attempts >= MAX_CODE_ATTEMPTS) throw badRequest('Превышено число попыток. Запросите новый код.');
    if (!safeEqual(v.codeHash, codeHash(v.id, code))) {
      await ctx.prisma.emailVerification.update({ where: { id }, data: { attempts: { increment: 1 } } });
      throw invalid();
    }
    // Атомарно помечаем код использованным (защита от повторного использования параллельными запросами)
    const marked = await ctx.prisma.emailVerification.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (marked.count !== 1) throw invalid();
    return v;
  }

  r.post(
    '/director/register/verify',
    codeLimiter,
    ah(async (req, res) => {
      const { verificationId, code } = parse(VerifySchema, req.body);
      if (await ownerRegistered()) throw conflict('Аккаунт директора уже создан. Используйте вход директора.');
      const v = await consumeCode(verificationId, code, 'OWNER_REGISTRATION');
      if (v.email !== ctx.config.INITIAL_DIRECTOR_EMAIL?.toLowerCase()) throw badRequest('Email владельца изменён. Начните регистрацию заново.');
      const p = v.payload as { firstName: string; lastName: string; login: string; passwordHash: string };

      // Атомарная регистрация: пользователь создаётся только если владелец ещё не назначен.
      const user = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { role: 'DIRECTOR', login: p.login, passwordHash: p.passwordHash, firstName: p.firstName, lastName: p.lastName, email: v.email },
        });
        const director = await tx.director.create({ data: { userId: created.id, isOwner: true } });
        await tx.systemState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
        const claimed = await tx.systemState.updateMany({
          where: { id: 1, ownerDirectorId: null },
          data: { ownerDirectorId: director.id, ownerRegisteredAt: new Date() },
        });
        if (claimed.count !== 1) throw conflict('Аккаунт директора уже создан.');
        return created;
      });

      const session = await createSession(ctx, req, res, user, 'DIRECTOR');
      req.auth = { session, user, role: 'DIRECTOR' };
      await audit(ctx, req, { action: 'director.owner_registered', summary: `Зарегистрирован основной аккаунт директора: ${user.lastName} ${user.firstName}`, targetType: 'user', targetId: user.id });
      res.status(201).json({ user: publicUser(user), csrfToken: session.csrfToken, isOwner: true });
    }),
  );

  // ───────── Безопасное восстановление доступа директора через email ─────────

  r.post(
    '/director/recover/start',
    codeLimiter,
    ah(async (req, res) => {
      const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Введите корректный email') }), req.body);
      const message = 'Если директор с таким email существует, на него отправлен код восстановления.';
      const user = await ctx.prisma.user.findFirst({ where: { email, role: 'DIRECTOR', status: { not: 'ARCHIVED' } } });
      if (!user || !ctx.mailer.configured) {
        res.json({ verificationId: crypto.randomUUID(), message });
        return;
      }
      const code = generateNumericCode(6);
      const id = crypto.randomUUID();
      await ctx.prisma.emailVerification.create({
        data: { id, purpose: 'DIRECTOR_PASSWORD_RECOVERY', email, codeHash: codeHash(id, code), payload: { userId: user.id }, expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000), ip: clientIp(req) },
      });
      await ctx.mailer.send({ to: email, ...codeEmail('восстановление доступа', `Запрошено восстановление пароля для логина «${user.login}».`, code) });
      res.json({ verificationId: id, message });
    }),
  );

  r.post(
    '/director/recover/verify',
    codeLimiter,
    ah(async (req, res) => {
      const body = parse(VerifySchema.extend({ newPassword: z.string().max(128) }), req.body);
      const problem = passwordProblems(body.newPassword);
      if (problem) throw badRequest(problem);
      const v = await consumeCode(body.verificationId, body.code, 'DIRECTOR_PASSWORD_RECOVERY');
      const { userId } = v.payload as { userId: string };
      const user = await ctx.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(body.newPassword), failedLogins: 0, lockedUntil: null, status: 'ACTIVE' },
      });
      await revokeUserSessions(ctx, user.id);
      await audit(ctx, null, { action: 'director.password_recovered', summary: `Пароль директора ${user.login} восстановлен через email`, targetType: 'user', targetId: user.id });
      res.json({ ok: true, login: user.login });
    }),
  );

  return r;
}

export async function publicStatus(ctx: AppContext) {
  const s = await ctx.prisma.systemState.findUnique({ where: { id: 1 } });
  const ownerRegistered = !!s?.ownerDirectorId;
  return {
    app: 'RegLocation',
    ownerRegistered,
    registrationAvailable: !ownerRegistered && !!ctx.config.INITIAL_DIRECTOR_EMAIL && ctx.mailer.configured,
    registrationProblem: ownerRegistered
      ? null
      : !ctx.config.INITIAL_DIRECTOR_EMAIL
        ? 'Не задан email владельца (INITIAL_DIRECTOR_EMAIL).'
        : !ctx.mailer.configured
          ? 'Не настроен почтовый сервис (SMTP).'
          : null,
    timezone: 'Asia/Tashkent',
  };
}
