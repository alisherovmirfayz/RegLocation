// Сквозная проверка живых серверов: node scripts/e2e-smoke.mjs <APP_URL> <MONITOR_URL> <backend-log-file>
// Регистрирует владельца (код берётся из лога в режиме MAIL_TRANSPORT=console), создаёт учителя и монитор,
// отмечает присутствие и проверяет события Socket.IO через оба домена.
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const APP = process.argv[2] ?? 'http://localhost:5174';
const MON = process.argv[3] ?? 'http://localhost:8080';
const LOG = process.argv[4];

class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = '';
  }
  get cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: this.base, Cookie: this.cookie, 'X-CSRF-Token': this.csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      this.cookies.set(k, v);
    }
    const data = await res.json().catch(() => ({}));
    if (data.csrfToken) this.csrf = data.csrfToken;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error}`);
    return data;
  }
}

const step = (msg) => console.log('✔', msg);
const waitFor = (socket, event, pred, ms = 8000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`нет события ${event}`)), ms);
    const h = (v) => {
      if (pred(v)) {
        clearTimeout(t);
        socket.off(event, h);
        resolve(v);
      }
    };
    socket.on(event, h);
  });

const director = new Client(APP);
const status = await director.req('GET', '/api/public/status');
if (!status.ownerRegistered) {
  const start = await director.req('POST', '/api/auth/director/register/start', {
    firstName: 'Нодира', lastName: 'Каримова', login: 'director', email: 'owner@example.com', password: 'Director-2026', passwordConfirm: 'Director-2026',
  });
  await new Promise((r) => setTimeout(r, 500));
  const code = [...readFileSync(LOG, 'utf8').matchAll(/Код подтверждения: (\d{6})/g)].pop()[1];
  await director.req('POST', '/api/auth/director/register/verify', { verificationId: start.verificationId, code });
  step('владелец зарегистрирован через код из email');
} else {
  await director.req('POST', '/api/auth/director/login', { login: 'director', password: 'Director-2026' });
  step('вход директора');
}

const t = await director.req('POST', '/api/director/teachers', { firstName: 'Алексей', lastName: 'Смоуков', positionTitle: 'Математика', classes: ['10A', '6B'] });
step(`учитель создан: ${t.credentials.login}`);
const rec = await director.req('POST', '/api/director/reception', { label: 'Ресепшен' });
step(`доступ к монитору: ${rec.credentials.login}`);

const monitor = new Client(MON);
await monitor.req('POST', '/api/auth/monitor/login', rec.credentials);
const ms = io(MON, { transports: ['websocket'], auth: { role: 'monitor' }, extraHeaders: { Cookie: monitor.cookie, Origin: MON } });
const first = await waitFor(ms, 'state', () => true);
step(`монитор подключён по Socket.IO, этажей в школе: ${first.buildings.find((b) => b.kind === 'SCHOOL').floors.length}`);

const teacher = new Client(APP);
await teacher.req('POST', '/api/auth/teacher/login', t.credentials);
const ts = io(APP, { transports: ['websocket'], auth: { role: 'teacher' }, extraHeaders: { Cookie: teacher.cookie, Origin: APP } });
await waitFor(ts, 'teacher:state', () => true);
step('телефон учителя подключён к Socket.IO через прокси проекта №2');

const arrived = waitFor(ms, 'state', (s) => s.teachers.some((x) => x.id === t.teacher.id && x.present));
const state = await teacher.req('POST', '/api/teacher/check-in').catch((e) => ({ error: e.message }));
if (state.error) step(`«Я в школе» отклонено сервером (ожидаемо после 17:00 по Ташкенту): ${state.error}`);
else {
  const snap = await arrived;
  const me = snap.teachers.find((x) => x.id === t.teacher.id);
  step(`монитор получил «в школе»: ${me.location.roomName} (${me.location.reason})`);
  const room = snap.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms)).find((r) => r.code === '405');
  const moved = waitFor(ms, 'state', (s) => s.teachers.find((x) => x.id === t.teacher.id)?.location.roomId === room.id);
  await director.req('POST', '/api/director/assignments', { teacherId: t.teacher.id, roomId: room.id, mode: 'UNTIL_CANCELLED' });
  await moved;
  step('директор переместил учителя в 405 — монитор обновился');
  await teacher.req('POST', '/api/teacher/check-out');
}

// Тестовый режим: 12:30 — столовая
const lunch = waitFor(ms, 'state', (s) => s.clock.simulated && s.teachers.find((x) => x.id === t.teacher.id)?.location.reason === 'MEAL');
await director.req('POST', '/api/director/simulation', { dayOfWeek: 1, hours: 12, minutes: 30, assumeAllPresent: true });
await lunch;
step('тестовый режим 12:30 — учитель в столовой');
await director.req('DELETE', '/api/director/simulation');
step('возврат к реальному времени');

ms.close();
ts.close();
console.log('ГОТОВО: сквозная проверка пройдена');
process.exit(0);
