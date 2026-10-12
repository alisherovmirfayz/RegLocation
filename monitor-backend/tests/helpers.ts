import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import supertest from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { loadConfig } from '../src/config';
import { createContext, startServer, type RunningServer } from '../src/app';
import { localToUtc, parseHM } from '../src/lib/time';

export const prisma = new PrismaClient();

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Управляемые часы: время Ташкента. 2026-10-12 — понедельник, 2026-10-17 — суббота. */
export class FakeClock {
  current = localToUtc('2026-10-12', parseHM('10:00'));
  now = () => new Date(this.current);
  set(date: string, time: string) {
    this.current = localToUtc(date, parseHM(time));
  }
}

export interface Harness {
  server: RunningServer;
  clock: FakeClock;
  url: string;
  outbox: { to: string; subject: string; text: string }[];
  agent(): Agent;
  close(): Promise<void>;
}

export class Agent {
  csrf = '';
  readonly http: ReturnType<typeof supertest.agent>;
  constructor(url: string) {
    this.http = supertest.agent(url);
  }
  get(path: string) {
    return this.http.get(path);
  }
  post(path: string, body?: object) {
    return this.http.post(path).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  put(path: string, body?: object) {
    return this.http.put(path).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.http.patch(path).set('X-CSRF-Token', this.csrf).send(body ?? {});
  }
  delete(path: string) {
    return this.http.delete(path).set('X-CSRF-Token', this.csrf);
  }
  /** Cookie-заголовок сессии — для подключения Socket.IO */
  cookie = '';
  remember(res: { headers: Record<string, unknown> }) {
    const set = res.headers['set-cookie'] as string[] | undefined;
    if (set?.length) this.cookie = set[0]!.split(';')[0]!;
  }
  async login(role: 'director' | 'teacher' | 'monitor', login: string, password: string) {
    const r = await this.http.post(`/api/auth/${role}/login`).send({ login, password });
    if (r.status === 200) {
      this.csrf = r.body.csrfToken;
      this.remember(r);
    }
    return r;
  }
}

export async function startHarness(opts: { reset?: boolean } = {}): Promise<Harness> {
  if (opts.reset !== false) await resetDb();
  const config = loadConfig(process.env);
  const clock = new FakeClock();
  const ctx = createContext(config, { clock });
  const server = await startServer(ctx, { port: 0, scheduler: false });
  const { port } = server.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    server,
    clock,
    url,
    outbox: ctx.mailer.outbox!,
    agent: () => new Agent(url),
    async close() {
      await server.close();
      await ctx.prisma.$disconnect();
    },
  };
}

export function connectSocket(url: string, role: 'monitor' | 'director' | 'teacher', cookie: string): Socket {
  return ioClient(url, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { role },
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
    reconnection: false,
    forceNew: true,
  });
}

export function nextEvent<T = unknown>(socket: Socket, event: string, predicate: (v: T) => boolean = () => true, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Событие ${event} не получено за ${timeoutMs} мс`));
    }, timeoutMs);
    const handler = (v: T) => {
      if (!predicate(v)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(v);
    };
    socket.on(event, handler);
  });
}

/** Полная регистрация владельца через email-код. */
export async function registerOwner(h: Harness, agent: Agent) {
  const start = await agent.http.post('/api/auth/director/register/start').send({
    firstName: 'Нодира',
    lastName: 'Каримова',
    login: 'director',
    email: 'owner@school.test',
    password: 'Director-2026',
    passwordConfirm: 'Director-2026',
  });
  if (start.status !== 200) throw new Error(`register/start: ${start.status} ${JSON.stringify(start.body)}`);
  const mail = h.outbox[h.outbox.length - 1]!;
  const code = /(\d{6})/.exec(mail.text)![1]!;
  const verify = await agent.http.post('/api/auth/director/register/verify').send({ verificationId: start.body.verificationId, code });
  if (verify.status !== 201) throw new Error(`register/verify: ${verify.status} ${JSON.stringify(verify.body)}`);
  agent.csrf = verify.body.csrfToken;
  agent.remember(verify);
  return verify;
}
