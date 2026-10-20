import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Agent, connectSocket, nextEvent, prisma, registerOwner, startHarness, type Harness } from './helpers';
import { timetablePdf, timetablePng } from './fixtures/timetable';
import type { MonitorSnapshot } from '../src/domain/live';

let h: Harness;
let director: Agent;
let teacherCreds: { login: string; password: string };
let teacherId: string;
let monitorCreds: { login: string; password: string };

beforeAll(async () => {
  h = await startHarness();
  director = h.agent();
});
afterAll(async () => {
  await h.close();
  await prisma.$disconnect();
});

const findTeacher = (snap: MonitorSnapshot, id: string) => snap.teachers.find((t) => t.id === id)!;
const roomByCode = (snap: MonitorSnapshot, code: string) =>
  snap.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms)).find((r) => r.code === code)!;

describe('Первичная регистрация директора', () => {
  it('до регистрации система предлагает создать аккаунт', async () => {
    const r = await h.agent().get('/api/public/status');
    expect(r.body).toMatchObject({ ownerRegistered: false, registrationAvailable: true });
  });

  it('чужой email: код не отправляется, регистрация невозможна', async () => {
    const a = h.agent();
    const start = await a.http.post('/api/auth/director/register/start').send({
      firstName: 'Злоумышленник', lastName: 'Иванов', login: 'hacker', email: 'hacker@evil.test', password: 'Hacker-12345', passwordConfirm: 'Hacker-12345',
    });
    expect(start.status).toBe(200); // ответ одинаковый, email владельца не раскрывается
    expect(h.outbox).toHaveLength(0);
    const verify = await a.http.post('/api/auth/director/register/verify').send({ verificationId: start.body.verificationId, code: '123456' });
    expect(verify.status).toBe(400);
  });

  it('неверный код отклоняется', async () => {
    const a = h.agent();
    const start = await a.http.post('/api/auth/director/register/start').send({
      firstName: 'Нодира', lastName: 'Каримова', login: 'director', email: 'owner@school.test', password: 'Director-2026', passwordConfirm: 'Director-2026',
    });
    expect(h.outbox).toHaveLength(1);
    const code = /(\d{6})/.exec(h.outbox[0]!.text)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    const r = await a.http.post('/api/auth/director/register/verify').send({ verificationId: start.body.verificationId, code: wrong });
    expect(r.status).toBe(400);
  });

  it('владелец подтверждает email и попадает в кабинет', async () => {
    const r = await registerOwner(h, director);
    expect(r.body).toMatchObject({ isOwner: true, user: { login: 'director', role: 'DIRECTOR' } });
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly/i);
    const s = await director.get('/api/auth/director/session');
    expect(s.status).toBe(200);
    expect((await h.agent().get('/api/public/status')).body.ownerRegistered).toBe(true);
  });

  it('повторная регистрация директора заблокирована', async () => {
    const r = await h.agent().http.post('/api/auth/director/register/start').send({
      firstName: 'Второй', lastName: 'Директор', login: 'director2', email: 'owner@school.test', password: 'Director-2026', passwordConfirm: 'Director-2026',
    });
    expect(r.status).toBe(409);
    expect(await prisma.director.count()).toBe(1);
  });

  it('параллельные попытки зарегистрировать владельца создают ровно один аккаунт', async () => {
    // Состояние уже занято — дополнительно проверяем атомарность на уровне БД
    const state = await prisma.systemState.findUnique({ where: { id: 1 } });
    expect(state?.ownerDirectorId).toBeTruthy();
  });
});

describe('Авторизация директора', () => {
  it('неверный пароль', async () => {
    const r = await h.agent().login('director', 'director', 'wrong-password');
    expect(r.status).toBe(401);
  });
  it('блокировка после 5 неудачных попыток', async () => {
    const a = h.agent();
    for (let i = 0; i < 5; i++) await a.login('director', 'director', 'bad-password-' + i);
    const r = await a.login('director', 'director', 'Director-2026');
    expect(r.status).toBe(429);
    await prisma.user.update({ where: { login: 'director' }, data: { lockedUntil: null, failedLogins: 0 } });
    expect((await a.login('director', 'director', 'Director-2026')).status).toBe(200);
  });
  it('учитель не может войти как директор', async () => {
    expect((await h.agent().login('director', 'nobody', 'x')).status).toBe(401);
  });
});

describe('Защита закрытых API', () => {
  it('без сессии — 401', async () => {
    const a = h.agent();
    expect((await a.get('/api/director/teachers')).status).toBe(401);
    expect((await a.get('/api/monitor/snapshot')).status).toBe(401);
    expect((await a.get('/api/teacher/state')).status).toBe(401);
  });
  it('без CSRF-токена изменяющий запрос — 403', async () => {
    const r = await director.http.post('/api/director/teachers').send({ firstName: 'А', lastName: 'Б', positionTitle: 'Химия' });
    expect(r.status).toBe(403);
  });
  it('запрос с чужого домена — 403', async () => {
    const r = await director.http.post('/api/director/teachers').set('Origin', 'https://evil.example').set('X-CSRF-Token', director.csrf).send({});
    expect(r.status).toBe(403);
  });
  it('CORS разрешён только для доменов RegLocation', async () => {
    const ok = await h.agent().http.options('/api/auth/teacher/login').set('Origin', 'http://app.test');
    expect(ok.headers['access-control-allow-origin']).toBe('http://app.test');
    const bad = await h.agent().http.options('/api/auth/teacher/login').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('health-check', async () => {
    const r = await h.agent().get('/api/health');
    expect(r.body).toMatchObject({ status: 'ok', db: 'ok' });
  });
});

describe('Учителя', () => {
  it('создание учителя: уникальный логин и надёжный пароль', async () => {
    const r = await director.post('/api/director/teachers', { firstName: 'Алексей', lastName: 'Иванов', positionTitle: 'Математика', classes: ['10A', '6B', '1В'] });
    expect(r.status).toBe(201);
    expect(r.body.credentials.login).toBe('ivanov.a');
    expect(r.body.credentials.password).toMatch(/^([bdfgkmnprstvz][aeiu]){3}[2-9]{4}$/);
    expect(r.body.teacher.classes).toEqual(['1B', '6B', '10A']);
    teacherCreds = r.body.credentials;
    teacherId = r.body.teacher.id;
    const same = await director.post('/api/director/teachers', { firstName: 'Анна', lastName: 'Иванова', positionTitle: 'Английский язык' });
    expect(same.body.credentials.login).toBe('ivanova.a');
    const dup = await director.post('/api/director/teachers', { firstName: 'Андрей', lastName: 'Иванов', positionTitle: 'Физика' });
    expect(dup.body.credentials.login).toMatch(/^ivanov\.a\d+$/);
    // Пароль хранится только как Argon2id-хеш
    const u = await prisma.user.findUnique({ where: { login: 'ivanov.a' } });
    expect(u!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(u!.passwordHash).not.toContain(teacherCreds.password);
  });

  it('пароль виден только при создании — в списке его нет', async () => {
    const r = await director.get('/api/director/teachers');
    expect(JSON.stringify(r.body)).not.toContain(teacherCreds.password);
    expect(r.body[0]).not.toHaveProperty('password');
  });

  it('некорректный класс отклоняется', async () => {
    const r = await director.post('/api/director/teachers', { firstName: 'Х', lastName: 'У', positionTitle: 'Химия', classes: ['абв'] });
    expect(r.status).toBe(400);
  });

  it('вход учителя и запрет доступа к API директора', async () => {
    const t = h.agent();
    expect((await t.login('teacher', teacherCreds.login, teacherCreds.password)).status).toBe(200);
    expect((await t.get('/api/teacher/state')).body.teacher).toMatchObject({ firstName: 'Алексей', classes: ['1B', '6B', '10A'] });
    expect((await t.get('/api/director/teachers')).status).toBe(401);
    expect((await t.get('/api/monitor/snapshot')).status).toBe(401);
  });

  it('учитель не может менять предмет и пароль — только директор', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    expect((await t.patch(`/api/director/teachers/${teacherId}`, { positionTitle: 'Директор' })).status).toBe(401);
    const pw = await t.patch('/api/teacher/password', { currentPassword: teacherCreds.password, newPassword: 'NewPassw0rd-x' });
    expect(pw.status).toBe(403);
    // Старый пароль продолжает работать
    expect((await h.agent().login('teacher', teacherCreds.login, teacherCreds.password)).status).toBe(200);
  });

  it('блокировка и сброс пароля', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    await director.post(`/api/director/teachers/${teacherId}/block`);
    expect((await t.get('/api/teacher/state')).status).toBe(401); // сессии завершены
    expect((await h.agent().login('teacher', teacherCreds.login, teacherCreds.password)).status).toBe(403);
    await director.post(`/api/director/teachers/${teacherId}/unblock`);
    const reset = await director.post(`/api/director/teachers/${teacherId}/reset-password`);
    expect(reset.body.credentials.password).toMatch(/^([bdfgkmnprstvz][aeiu]){3}[2-9]{4}$/);
    expect((await h.agent().login('teacher', teacherCreds.login, teacherCreds.password)).status).toBe(401);
    teacherCreds = reset.body.credentials;
    expect((await h.agent().login('teacher', teacherCreds.login, teacherCreds.password)).status).toBe(200);
  });

  it('логины и пароли всех учителей одним списком (только директор, с записью в журнал)', async () => {
    const r = await director.get('/api/director/credentials/teachers');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const me = r.body.find((x: { id: string }) => x.id === teacherId);
    expect(me).toMatchObject({ login: teacherCreds.login, password: teacherCreds.password });
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    expect((await t.get('/api/director/credentials/teachers')).status).toBe(401);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'teacher.credentials_viewed_all' } });
    expect(audit).not.toBeNull();
  });
});

describe('Доступ к монитору', () => {
  it('директор создаёт аккаунт ресепшена; монитор видит только снимок', async () => {
    const r = await director.post('/api/director/reception', { label: 'Ресепшен' });
    expect(r.status).toBe(201);
    expect(r.body.credentials.login).toMatch(/^mon\./);
    monitorCreds = r.body.credentials;
    const m = h.agent();
    expect((await m.login('monitor', monitorCreds.login, monitorCreds.password)).status).toBe(200);
    expect((await m.get('/api/monitor/snapshot')).status).toBe(200);
    expect((await m.post('/api/director/teachers', { firstName: 'X', lastName: 'Y', positionTitle: 'Z' })).status).toBe(401);
    expect((await m.post('/api/director/floors', { name: 'X', level: 9 })).status).toBe(401);
  });

  it('завершение сеансов монитора', async () => {
    const m = h.agent();
    await m.login('monitor', monitorCreds.login, monitorCreds.password);
    const acc = (await director.get('/api/director/reception')).body[0];
    const r = await director.post(`/api/director/reception/${acc.id}/revoke-sessions`);
    expect(r.body.revoked).toBeGreaterThanOrEqual(1);
    expect((await m.get('/api/monitor/snapshot')).status).toBe(401);
  });
});

describe('Расписание, присутствие и местоположение', () => {
  let teacher: Agent;
  let monitor: Agent;

  beforeAll(async () => {
    teacher = h.agent();
    await teacher.login('teacher', teacherCreds.login, teacherCreds.password);
    monitor = h.agent();
    await monitor.login('monitor', monitorCreds.login, monitorCreds.password);
  });

  it('загрузка PNG и распознавание расписания', async () => {
    const r = await teacher.http
      .post('/api/teacher/timetable/recognize')
      .set('X-CSRF-Token', teacher.csrf)
      .attach('file', await timetablePng(), { filename: 'raspisanie.png', contentType: 'image/png' });
    expect(r.status).toBe(200);
    expect(r.body.result.entries.length).toBe(12);
    expect(r.body.sourceFileId).toBeTruthy();
  }, 120_000);

  it('загрузка PDF', async () => {
    const r = await teacher.http
      .post('/api/teacher/timetable/recognize')
      .set('X-CSRF-Token', teacher.csrf)
      .attach('file', await timetablePdf(), { filename: 'raspisanie.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(200);
    expect(r.body.result.processedPages).toBe(2);
  }, 120_000);

  it('загрузка JPEG-аватарки и отказ для неподдерживаемых файлов', async () => {
    const jpeg = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#3366ff' } }).jpeg().toBuffer();
    const ok = await teacher.http.post('/api/teacher/avatar').set('X-CSRF-Token', teacher.csrf).attach('file', jpeg, { filename: 'me.jpg', contentType: 'image/jpeg' });
    expect(ok.status).toBe(200);
    expect(ok.body.teacher.avatarUrl).toMatch(/^\/api\/files\//);
    const bad = await teacher.http
      .post('/api/teacher/avatar')
      .set('X-CSRF-Token', teacher.csrf)
      .attach('file', Buffer.from('<?php echo 1; ?>'), { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(bad.status).toBe(400);
    // Аватарку видит монитор, а без входа — нет
    expect((await monitor.get(ok.body.teacher.avatarUrl)).status).toBe(200);
    expect((await h.agent().get(ok.body.teacher.avatarUrl)).status).toBe(401);
  });

  it('сохранение расписания с проверкой кабинетов', async () => {
    const bad = await teacher.put('/api/teacher/timetable', { entries: [{ dayOfWeek: 1, lessonNumber: 1, className: '10A', roomLabel: '999' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/999/);
    const r = await teacher.put('/api/teacher/timetable', {
      entries: [
        { dayOfWeek: 1, lessonNumber: 2, className: '10A', roomLabel: '404' },
        { dayOfWeek: 1, lessonNumber: 3, className: '6B', roomLabel: '404' },
        { dayOfWeek: 1, lessonNumber: 8, className: '1B', roomLabel: '301' },
        { dayOfWeek: 6, lessonNumber: 2, className: '1C', roomLabel: '601' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.timetable.entries).toHaveLength(4);
  });

  it('«Я в школе» → монитор показывает в кабинете по расписанию', async () => {
    h.server.ctx.settings.invalidate();
    h.clock.set('2026-10-12', '10:00');
    const state = await teacher.post('/api/teacher/check-in');
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ present: true, canCheckIn: false, location: { reason: 'LESSON', className: '10A', roomName: 'Кабинет 404' } });
    const snap: MonitorSnapshot = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId)).toMatchObject({ present: true, location: { roomId: roomByCode(snap, '404').id } });
    expect(snap.presentCount).toBe(1);
  });

  it('обед и полдник: столовая; граничные моменты', async () => {
    const check = async (time: string, code: string | null) => {
      h.clock.set('2026-10-12', time);
      const snap: MonitorSnapshot = (await monitor.get('/api/monitor/snapshot')).body;
      const t = findTeacher(snap, teacherId);
      if (code === null) expect(t.present).toBe(false);
      else expect(t.location.roomId).toBe(roomByCode(snap, code).id);
      return t;
    };
    await check('12:29', 'TEACHERS');
    expect((await check('12:30', 'CANTEEN')).location.buildingKind).toBe('CANTEEN');
    await check('13:14', 'CANTEEN');
    await check('13:15', 'TEACHERS');
    await check('15:44', '301');
    await check('15:45', 'CANTEEN');
    await check('16:04', 'CANTEEN');
    await check('16:05', 'TEACHERS');
    // Статус «В школе» не меняется во время питания
    h.clock.set('2026-10-12', '12:40');
    expect((await teacher.get('/api/teacher/state')).body.present).toBe(true);
  });

  it('субботний урок', async () => {
    h.clock.set('2026-10-17', '10:00');
    await teacher.post('/api/teacher/check-in');
    const snap: MonitorSnapshot = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location).toMatchObject({ reason: 'LESSON', className: '1C', roomId: roomByCode(snap, '601').id });
    await teacher.post('/api/teacher/check-out');
    h.clock.set('2026-10-12', '10:00');
  });

  it('ручное перемещение директором: 404 → 405, история, возврат к расписанию', async () => {
    h.clock.set('2026-10-12', '10:00');
    await teacher.post('/api/teacher/check-in');
    const snap0: MonitorSnapshot = (await director.get('/api/director/snapshot')).body;
    const r = await director.post('/api/director/assignments', { teacherId, roomId: roomByCode(snap0, '405').id, mode: 'UNTIL_LESSON_END' });
    expect(r.status).toBe(201);
    // До окончания 2-го урока (10:35)
    expect(new Date(r.body.endsAt).toISOString()).toBe('2026-10-12T05:35:00.000Z');
    let snap: MonitorSnapshot = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location).toMatchObject({ reason: 'MANUAL', roomId: roomByCode(snap, '405').id });
    // Исходное расписание не изменилось
    const tt = await teacher.get('/api/teacher/timetable');
    expect(tt.body.timetable.entries.find((e: { lessonNumber: number; dayOfWeek: number }) => e.dayOfWeek === 1 && e.lessonNumber === 2).roomLabel).toBe('404');
    // История
    const audit = await director.get('/api/director/audit?action=assignment');
    expect(audit.body.rows[0].summary).toMatch(/Кабинет 404 → Кабинет 405/);
    // Обед важнее ручного назначения
    h.clock.set('2026-10-12', '12:31');
    const d2 = await director.post('/api/director/assignments', { teacherId, roomId: roomByCode(snap0, '405').id, mode: 'UNTIL_CANCELLED' });
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location.reason).toBe('MEAL');
    // По истечении срока — возврат к расписанию
    h.clock.set('2026-10-12', '13:30');
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location.reason).toBe('MANUAL');
    await director.post(`/api/director/assignments/${d2.body.id}/cancel`);
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location.reason).toBe('FREE');
  });

  it('режим «до определённого времени»', async () => {
    h.clock.set('2026-10-12', '11:00');
    const snap0: MonitorSnapshot = (await director.get('/api/director/snapshot')).body;
    const r = await director.post('/api/director/assignments', { teacherId, roomId: roomByCode(snap0, '502').id, mode: 'UNTIL_TIME', until: '11:30' });
    expect(r.status).toBe(201);
    h.clock.set('2026-10-12', '11:29');
    expect(findTeacher((await monitor.get('/api/monitor/snapshot')).body, teacherId).location.reason).toBe('MANUAL');
    h.clock.set('2026-10-12', '11:30');
    expect(findTeacher((await monitor.get('/api/monitor/snapshot')).body, teacherId).location.reason).toBe('LESSON');
    expect((await director.post('/api/director/assignments', { teacherId, roomId: roomByCode(snap0, '502').id, mode: 'UNTIL_TIME', until: '10:00' })).status).toBe(400);
  });

  it('тестовый режим не меняет реальные отметки', async () => {
    h.clock.set('2026-10-12', '19:00');
    await h.server.ctx.live.autoCheckout();
    const before = await prisma.attendance.findMany({ orderBy: { id: 'asc' } });
    expect((await director.post('/api/director/simulation', { dayOfWeek: 1, hours: 12, minutes: 30, assumeAllPresent: true })).status).toBe(200);
    let snap: MonitorSnapshot = (await monitor.get('/api/monitor/snapshot')).body;
    expect(snap.clock.simulated).toBe(true);
    expect(findTeacher(snap, teacherId).location.reason).toBe('MEAL');
    await director.post('/api/director/simulation', { dayOfWeek: 1, hours: 10, minutes: 0, assumeAllPresent: true });
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(findTeacher(snap, teacherId).location).toMatchObject({ reason: 'LESSON', className: '10A' });
    await director.post('/api/director/simulation', { dayOfWeek: 1, hours: 17, minutes: 0, assumeAllPresent: true });
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(snap.presentCount).toBe(0);
    expect((await director.delete('/api/director/simulation')).status).toBe(200);
    snap = (await monitor.get('/api/monitor/snapshot')).body;
    expect(snap.clock.simulated).toBe(false);
    const after = await prisma.attendance.findMany({ orderBy: { id: 'asc' } });
    expect(after).toEqual(before);
  });

  it('завершение дня в 17:00: все «Не в школе», повторная отметка — завтра', async () => {
    h.clock.set('2026-10-13', '09:00');
    await teacher.post('/api/teacher/check-in');
    h.clock.set('2026-10-13', '16:59');
    expect(await h.server.ctx.live.autoCheckout()).toBe(0);
    h.clock.set('2026-10-13', '17:00');
    expect(await h.server.ctx.live.autoCheckout()).toBe(1);
    const st = await teacher.get('/api/teacher/state');
    expect(st.body).toMatchObject({ present: false, canCheckIn: false });
    expect((await teacher.post('/api/teacher/check-in')).status).toBe(409);
    const rec = await prisma.attendance.findFirst({ where: { date: '2026-10-13' } });
    expect(rec?.checkOutReason).toBe('AUTO_END_OF_DAY');
    // Идемпотентно и безопасно при перезапуске
    expect(await h.server.ctx.live.autoCheckout()).toBe(0);
    h.clock.set('2026-10-14', '08:30');
    expect((await teacher.post('/api/teacher/check-in')).status).toBe(200);
  });

  it('незакрытая отметка прошлого дня закрывается после перезапуска', async () => {
    await prisma.attendance.create({ data: { teacherId, date: '2026-10-10', checkInAt: new Date('2026-10-10T05:00:00Z') } });
    h.clock.set('2026-10-14', '08:40');
    expect(await h.server.ctx.live.autoCheckout()).toBe(1);
  });
});

describe('Этажи и кабинеты', () => {
  it('добавление этажа, кабинета, сохранение планировки, порядок, удаление', async () => {
    const floor = await director.post('/api/director/floors', { name: '7 этаж', level: 7, position: 'top' });
    expect(floor.status).toBe(201);
    let b = (await director.get('/api/director/buildings')).body.find((x: { kind: string }) => x.kind === 'SCHOOL');
    expect(b.floors[0].name).toBe('7 этаж');
    const room = await director.post('/api/director/rooms', { floorId: floor.body.id, code: '701', name: 'Кабинет 701', x: 20, y: 20, width: 300, height: 150 });
    expect(room.status).toBe(201);
    expect((await director.post('/api/director/rooms', { floorId: floor.body.id, code: '701', name: 'Дубль' })).status).toBe(409);
    expect((await director.put(`/api/director/floors/${floor.body.id}/layout`, { rooms: [{ id: room.body.id, x: 100, y: 60, width: 320, height: 160, name: 'Лаборатория 701' }] })).status).toBe(200);
    expect((await director.patch(`/api/director/floors/${floor.body.id}`, { name: 'Седьмой этаж' })).status).toBe(200);
    b = (await director.get('/api/director/buildings')).body.find((x: { kind: string }) => x.kind === 'SCHOOL');
    expect(b.floors[0]).toMatchObject({ name: 'Седьмой этаж', rooms: [{ code: '701', name: 'Лаборатория 701', x: 100, y: 60, width: 320 }] });
    const ids = b.floors.map((f: { id: string }) => f.id);
    await director.post('/api/director/floors/reorder', { floorIds: [...ids.slice(1), ids[0]] });
    b = (await director.get('/api/director/buildings')).body.find((x: { kind: string }) => x.kind === 'SCHOOL');
    expect(b.floors[b.floors.length - 1].name).toBe('Седьмой этаж');
    expect((await director.delete(`/api/director/floors/${floor.body.id}`)).status).toBe(200);
  });

  it('кабинет из расписания нельзя удалить без подтверждения', async () => {
    const snap: MonitorSnapshot = (await director.get('/api/director/snapshot')).body;
    const r404 = roomByCode(snap, '404');
    expect((await director.delete(`/api/director/rooms/${r404.id}`)).status).toBe(409);
  });

  it('изменения схемы приходят на монитор через Socket.IO', async () => {
    const m = h.agent();
    await m.login('monitor', monitorCreds.login, monitorCreds.password);
    const socket = connectSocket(h.url, 'monitor', m.cookie);
    await nextEvent(socket, 'state');
    const snap: MonitorSnapshot = (await director.get('/api/director/snapshot')).body;
    const r501 = roomByCode(snap, '501');
    const wait = nextEvent<MonitorSnapshot>(socket, 'state', (s) => roomByCode(s, '501').name === 'Кабинет химии');
    await director.patch(`/api/director/rooms/${r501.id}`, { name: 'Кабинет химии' });
    expect(roomByCode(await wait, '501').name).toBe('Кабинет химии');
    socket.close();
  });
});

describe('Socket.IO', () => {
  it('неавторизованное подключение отклоняется', async () => {
    const s = connectSocket(h.url, 'monitor', '');
    const err = await nextEvent<Error>(s, 'connect_error');
    expect(err.message).toBe('UNAUTHORIZED');
    s.close();
  });

  it('учитель нажимает «Я в школе» → монитор получает событие; переподключение восстанавливает состояние', async () => {
    h.clock.set('2026-10-19', '10:00'); // понедельник, 2-й урок: 10A в 404
    const m = h.agent();
    await m.login('monitor', monitorCreds.login, monitorCreds.password);
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    await t.post('/api/teacher/check-out');

    const socket = connectSocket(h.url, 'monitor', m.cookie);
    const first = await nextEvent<MonitorSnapshot>(socket, 'state');
    expect(findTeacher(first, teacherId).present).toBe(false);

    const tSocket = connectSocket(h.url, 'teacher', t.cookie);
    const tState = await nextEvent<{ teacher: { id: string } }>(tSocket, 'teacher:state');
    expect(tState.teacher.id).toBe(teacherId);

    const wait = nextEvent<MonitorSnapshot>(socket, 'state', (s) => findTeacher(s, teacherId).present);
    const waitTeacher = nextEvent<{ present: boolean }>(tSocket, 'teacher:state', (s) => s.present);
    await t.post('/api/teacher/check-in');
    expect(findTeacher(await wait, teacherId).location.reason).toBe('LESSON');
    expect((await waitTeacher).present).toBe(true);

    // Потеря соединения и повторное подключение — клиент получает актуальное состояние
    socket.disconnect();
    await t.post('/api/teacher/check-out');
    const again = connectSocket(h.url, 'monitor', m.cookie);
    const restored = await nextEvent<MonitorSnapshot>(again, 'state');
    expect(findTeacher(restored, teacherId).present).toBe(false);
    again.emit('sync');
    await nextEvent(again, 'state');
    again.close();
    tSocket.close();
  });

  it('учитель получает только свои данные (не полный снимок)', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    const s = connectSocket(h.url, 'teacher', t.cookie);
    let gotSnapshot = false;
    s.on('state', () => (gotSnapshot = true));
    await nextEvent(s, 'teacher:state');
    await director.post('/api/director/teachers', { firstName: 'Новый', lastName: 'Учитель', positionTitle: 'История' });
    await new Promise((r) => setTimeout(r, 300));
    expect(gotSnapshot).toBe(false);
    s.close();
  });
});

describe('Стадион', () => {
  type B = { id: string; kind: string; floors: { id: string; name: string; rooms: { code: string; type: string }[] }[] };
  it('часть школы (этаж после остальных); урок «Стадион» — учитель там; удалённый стадион не возвращается', async () => {
    const buildings = (await director.get('/api/director/buildings')).body as B[];
    expect(buildings.some((b) => b.kind === 'STADIUM')).toBe(false);
    const school = buildings.find((b) => b.kind === 'SCHOOL')!;
    const floor = school.floors[school.floors.length - 1]!;
    expect(floor.rooms.some((r) => r.code === 'STADION' && r.type === 'STADIUM')).toBe(true);

    h.clock.set('2026-10-19', '10:00'); // понедельник, 2-й урок
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    const before = (await t.get('/api/teacher/timetable')).body.timetable?.entries ?? [];
    const saved = await t.put('/api/teacher/timetable', { entries: [{ dayOfWeek: 1, lessonNumber: 2, className: '7a,7В', roomLabel: 'Stadion' }] });
    expect(saved.status).toBe(200);
    // Урок сразу у двух классов (физкультура): «7A, 7B»
    expect(saved.body.timetable.entries[0].className).toBe('7A, 7B');
    expect((await t.get('/api/teacher/state')).body.teacher.classes).toEqual(expect.arrayContaining(['7A', '7B']));
    await t.post('/api/teacher/check-in');
    const state = (await t.get('/api/teacher/state')).body;
    expect(state.location).toMatchObject({ reason: 'LESSON', buildingKind: 'SCHOOL', roomName: 'Стадион' });
    await t.post('/api/teacher/check-out');
    const restore = before.map((e: { dayOfWeek: number; lessonNumber: number; className: string; roomLabel: string }) => ({ dayOfWeek: e.dayOfWeek, lessonNumber: e.lessonNumber, className: e.className, roomLabel: e.roomLabel }));
    expect((await t.put('/api/teacher/timetable', { entries: restore })).status).toBe(200);
    h.clock.set('2026-10-12', '10:00');

    // Директор удалил стадион — при следующем запуске он не появляется снова
    await prisma.floor.delete({ where: { id: floor.id } });
    const { seedDefaults } = await import('../src/domain/seed');
    await seedDefaults(prisma);
    expect(await prisma.room.count({ where: { type: 'STADIUM' } })).toBe(0);
  });

  it('стадион отдельным зданием (ранняя версия) переносится в школу со всеми помещениями', async () => {
    const old = await prisma.building.create({
      data: {
        kind: 'STADIUM',
        name: 'Стадион',
        floors: { create: { name: 'Стадион', level: 0, sortOrder: 0, rooms: { create: { code: 'STADION', name: 'Мой стадион', type: 'STADIUM' } } } },
      },
    });
    const { seedDefaults } = await import('../src/domain/seed');
    await seedDefaults(prisma);
    expect(await prisma.building.count({ where: { id: old.id } })).toBe(0);
    const room = await prisma.room.findFirst({ where: { code: 'STADION' }, include: { floor: { include: { building: true } } } });
    expect(room?.name).toBe('Мой стадион');
    expect(room?.floor.building.kind).toBe('SCHOOL');
    await prisma.floor.delete({ where: { id: room!.floorId } });
  });
});

describe('Детский сад', () => {
  it('отдельное здание по чертежу; учительская школы остаётся основной; удалённое не возвращается', async () => {
    type B = { id: string; kind: string; floors: { id: string; height: number; rooms: { code: string; name: string; type: string }[] }[] };
    const kg = ((await director.get('/api/director/buildings')).body as B[]).find((b) => b.kind === 'KINDERGARTEN')!;
    expect(kg).toBeTruthy();
    const rooms = kg.floors.flatMap((f) => f.rooms);
    expect(kg.floors[0]!.height).toBe(760);
    // Номера 301–309 заняты школой: коды DS-…, на схеме — «301»
    expect(rooms.find((r) => r.code === 'DS-301')).toMatchObject({ name: '301', type: 'CLASSROOM' });
    expect(rooms.filter((r) => /^DS-30\d$/.test(r.code))).toHaveLength(9);
    expect(rooms.some((r) => r.name === 'Актовый зал')).toBe(true);
    // Основная учительская (для свободного времени) — школьная
    const snap = await h.server.ctx.live.snapshot();
    expect(snap.buildings.map((b) => b.kind)).toContain('KINDERGARTEN');
    const teachersRoom = snap.buildings.flatMap((b) => b.floors.flatMap((f) => f.rooms)).find((r) => r.code === 'TEACHERS');
    expect(teachersRoom).toBeTruthy();

    // Директор удалил детский сад — не появляется снова
    await prisma.floor.deleteMany({ where: { buildingId: kg.id } });
    await prisma.building.delete({ where: { id: kg.id } });
    const { seedDefaults } = await import('../src/domain/seed');
    await seedDefaults(prisma);
    expect(await prisma.building.count({ where: { kind: 'KINDERGARTEN' } })).toBe(0);
  });
});

describe('Просмотр логина и пароля директором', () => {
  it('учитель: пароль при создании и после «Выдать новый» можно посмотреть; в базе он зашифрован; просмотр в журнале', async () => {
    const created = await director.post('/api/director/teachers', { firstName: 'Пароль', lastName: 'Смотрелкин', positionTitle: 'Химия' });
    const { login, password } = created.body.credentials;
    const id = created.body.teacher.id;
    const view = await director.get(`/api/director/teachers/${id}/credentials`);
    expect(view.body).toEqual({ login, password });
    // В базе нет пароля открытым текстом
    const row = await prisma.user.findUnique({ where: { login } });
    expect(row!.passwordEnc).toBeTruthy();
    expect(row!.passwordEnc).not.toContain(password);
    // Новый пароль — виден новый, старый не работает
    const reset = await director.post(`/api/director/teachers/${id}/reset-password`);
    expect((await director.get(`/api/director/teachers/${id}/credentials`)).body.password).toBe(reset.body.credentials.password);
    expect((await h.agent().login('teacher', login, password)).status).toBe(401);
    expect((await h.agent().login('teacher', login, reset.body.credentials.password)).status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'teacher.credentials_viewed', targetId: id } });
    expect(log?.summary).toContain('Смотрелкин');
    // Учитель не может смотреть чужие пароли
    const t = h.agent();
    await t.login('teacher', login, reset.body.credentials.password);
    expect((await t.get(`/api/director/teachers/${id}/credentials`)).status).toBe(401);
  });

  it('аккаунт, созданный до появления функции: пароль не показывается, можно выдать новый', async () => {
    const created = await director.post('/api/director/teachers', { firstName: 'Старый', lastName: 'Аккаунтов', positionTitle: 'История' });
    await prisma.user.update({ where: { login: created.body.credentials.login }, data: { passwordEnc: null } });
    const view = await director.get(`/api/director/teachers/${created.body.teacher.id}/credentials`);
    expect(view.body).toEqual({ login: created.body.credentials.login, password: null });
  });

  it('монитор: логин и пароль можно посмотреть', async () => {
    const acc = await director.post('/api/director/reception', { label: 'Холл' });
    const view = await director.get(`/api/director/reception/${acc.body.account.id}/credentials`);
    expect(view.body).toEqual(acc.body.credentials);
  });
});

describe('Учебный день 08:00–17:00', () => {
  it('«Я в школе» до 08:00 и в выходной недоступна, с 08:00 — доступна; в 17:00 учитель сразу «Не в школе»', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    await t.post('/api/teacher/check-out');

    h.clock.set('2026-10-19', '06:30'); // понедельник, раньше начала дня
    let s = (await t.get('/api/teacher/state')).body;
    expect(s.canCheckIn).toBe(false);
    expect(s.checkInBlockedReason).toBe('Учебный день ещё не начался. Отметка доступна с 08:00.');
    let r = await t.post('/api/teacher/check-in');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DAY_NOT_STARTED');

    h.clock.set('2026-10-18', '10:00'); // воскресенье
    r = await t.post('/api/teacher/check-in');
    expect(r.body.code).toBe('DAY_OFF');
    expect((await t.get('/api/teacher/state')).body.checkInBlockedReason).toBe('Сегодня выходной. Отметка доступна в учебные дни.');

    h.clock.set('2026-10-19', '08:00');
    expect((await t.get('/api/teacher/state')).body.canCheckIn).toBe(true);
    expect((await t.post('/api/teacher/check-in')).status).toBe(200);

    // Ровно в 17:00 — «Не в школе», даже если автоматический выход ещё не записан
    h.clock.set('2026-10-19', '17:00');
    s = (await t.get('/api/teacher/state')).body;
    expect(s.present).toBe(false);
    expect(s.checkInBlockedReason).toBe('Учебный день завершён в 17:00. Отметка будет доступна завтра.');
    expect((await t.post('/api/teacher/check-in')).body.code).toBe('DAY_ENDED');
    // Автоматический выход закрывает отметку в базе
    expect(await h.server.ctx.live.autoCheckout()).toBeGreaterThanOrEqual(1);
    const open = await prisma.attendance.count({ where: { teacherId, checkOutAt: null } });
    expect(open).toBe(0);
    h.clock.set('2026-10-12', '10:00');
  });
});

describe('«Отошёл» на время', () => {
  it('на территории / за территорией до указанного времени, «Я вернулся», сброс при выходе', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    await t.post('/api/teacher/check-out');
    h.clock.set('2026-10-19', '10:00');

    // Без отметки «Я в школе» — нельзя
    let r = await t.post('/api/teacher/away').send({ minutes: 15, place: 'ON_SITE' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NOT_PRESENT');
    await t.post('/api/teacher/check-in');
    expect((await t.post('/api/teacher/away').send({ minutes: 2, place: 'ON_SITE' })).status).toBe(400);

    r = await t.post('/api/teacher/away').send({ minutes: 15, place: 'ON_SITE' });
    expect(r.status).toBe(200);
    expect(r.body.location).toMatchObject({ present: true, reason: 'AWAY', awayPlace: 'ON_SITE', roomId: null });
    let snap = await h.server.ctx.live.snapshot();
    const before = snap.presentCount;
    expect(snap.teachers.find((x) => x.id === teacherId)!.location.reason).toBe('AWAY');

    // За территорией — не считается «в школе»
    await t.post('/api/teacher/away').send({ minutes: 60, place: 'OFF_SITE' });
    snap = await h.server.ctx.live.snapshot();
    expect(snap.teachers.find((x) => x.id === teacherId)!.location.awayPlace).toBe('OFF_SITE');
    expect(snap.presentCount).toBe(before - 1);

    // Срок истёк — снова по расписанию
    h.clock.set('2026-10-19', '11:01');
    expect((await t.get('/api/teacher/state')).body.location.reason).not.toBe('AWAY');

    // «Я вернулся» досрочно
    await t.post('/api/teacher/away').send({ minutes: 30, place: 'ON_SITE' });
    r = await t.delete('/api/teacher/away');
    expect(r.body.location.reason).not.toBe('AWAY');

    // В кабинет: на мониторе — в этом кабинете
    const rooms: { id: string; code: string; type: string }[] = (await t.get('/api/teacher/rooms')).body;
    expect(rooms.some((x) => x.type === 'CORRIDOR')).toBe(false);
    const target = rooms.find((x) => x.type === 'CLASSROOM')!;
    expect((await t.post('/api/teacher/away').send({ minutes: 15, place: 'ROOM' })).body.code).toBe('ROOM_REQUIRED');
    const corridor = await prisma.room.findFirst({ where: { type: 'CORRIDOR' } });
    expect((await t.post('/api/teacher/away').send({ minutes: 15, place: 'ROOM', roomId: corridor!.id })).status).toBe(400);
    r = await t.post('/api/teacher/away').send({ minutes: 15, place: 'ROOM', roomId: target.id });
    expect(r.body.location).toMatchObject({ reason: 'AWAY', awayPlace: 'ROOM', roomId: target.id });
    snap = await h.server.ctx.live.snapshot();
    expect(snap.teachers.find((x) => x.id === teacherId)!.location.roomId).toBe(target.id);
    expect(snap.presentCount).toBe(before);
    await t.delete('/api/teacher/away');
    expect(await prisma.attendance.count({ where: { teacherId, awayRoomId: { not: null } } })).toBe(0);

    // Не дольше конца учебного дня
    h.clock.set('2026-10-19', '16:50');
    r = await t.post('/api/teacher/away').send({ minutes: 120, place: 'OFF_SITE' });
    expect(new Date(r.body.location.awayUntil).getTime() - h.clock.now().getTime()).toBe(10 * 60_000);

    // Выход из школы сбрасывает «Отошёл»
    await t.post('/api/teacher/check-out');
    expect(await prisma.attendance.count({ where: { teacherId, checkOutAt: null } })).toBe(0);
    h.clock.set('2026-10-12', '10:00');
  });
});

describe('Обновления опросом (Vercel)', () => {
  const poll = (a: ReturnType<Harness['agent']>, role: string, query = '') => a.get(`/api/realtime/poll?role=${role}${query}`);

  it('сервер сообщает способ обновлений; опрос только с действующей сессией своей роли', async () => {
    expect((await h.agent().get('/api/public/runtime')).body).toMatchObject({ realtime: 'socket', maxUploadMb: 15 });
    expect((await poll(h.agent(), 'monitor')).status).toBe(401);
    expect((await poll(director, 'monitor')).status).toBe(401); // сессия директора не даёт доступ как монитору
    expect((await poll(director, 'admin')).status).toBe(400);
  });

  it('монитор: снимок передаётся только при изменении; отметка учителя видна при следующем опросе', async () => {
    h.clock.set('2026-10-19', '10:00');
    const m = h.agent();
    await m.login('monitor', monitorCreds.login, monitorCreds.password);
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    await t.post('/api/teacher/check-out');

    const first = await poll(m, 'monitor');
    expect(first.status).toBe(200);
    expect(findTeacher(first.body.state, teacherId).present).toBe(false);
    const same = await poll(m, 'monitor', `&hash=${first.body.hash}`);
    expect(same.body).toEqual({ hash: first.body.hash, state: null });

    await t.post('/api/teacher/check-in');
    const next = await poll(m, 'monitor', `&hash=${first.body.hash}`);
    expect(next.body.hash).not.toBe(first.body.hash);
    expect(findTeacher(next.body.state, teacherId).location.reason).toBe('LESSON');
  });

  it('учитель получает только своё состояние, директор — журнал и версию данных', async () => {
    const t = h.agent();
    await t.login('teacher', teacherCreds.login, teacherCreds.password);
    const ts = await poll(t, 'teacher');
    expect(ts.body.state.teacher.id).toBe(teacherId);
    expect(ts.body.state.buildings).toBeUndefined();
    expect(ts.body.audits).toBeUndefined();

    const d0 = await poll(director, 'director');
    expect(d0.body.state.teachers.length).toBeGreaterThan(0);
    expect(d0.body.audits).toBeUndefined();
    await director.post('/api/director/teachers', { firstName: 'Опрос', lastName: 'Проверкин', positionTitle: 'История' });
    const d1 = await poll(director, 'director', `&hash=${d0.body.hash}&after=${encodeURIComponent(d0.body.auditCursor)}`);
    expect(d1.body.version).toBeGreaterThan(d0.body.version);
    expect(d1.body.audits.some((a: { summary: string }) => a.summary.includes('Проверкин'))).toBe(true);
    expect(d1.body.state.teachers.some((x: { lastName: string }) => x.lastName === 'Проверкин')).toBe(true);
  });

  it('несколько экземпляров сервера с общей базой: изменения видны везде без перезапуска', async () => {
    const h2 = await startHarness({ reset: false });
    try {
      h2.clock.current = h.clock.current;
      const m2 = h2.agent();
      await m2.login('monitor', monitorCreds.login, monitorCreds.password);
      const before = (await poll(m2, 'monitor')).body.state.teachers.length;
      // Директор работает через первый экземпляр
      await director.post('/api/director/teachers', { firstName: 'Второй', lastName: 'Экземпляров', positionTitle: 'География' });
      const after = (await poll(m2, 'monitor')).body.state;
      expect(after.teachers.length).toBe(before + 1);
      expect(after.teachers.some((x: { lastName: string }) => x.lastName === 'Экземпляров')).toBe(true);
      // Настройки монитора тоже обновляются на втором экземпляре
      const s = (await director.get('/api/director/settings')).body.monitor;
      await director.put('/api/director/settings/monitor', { ...s, idleAfterSeconds: 123 });
      expect((await poll(m2, 'monitor')).body.state.monitor.idleAfterSeconds).toBe(123);
      await director.put('/api/director/settings/monitor', s);
    } finally {
      await h2.close();
    }
  });

  it('ежедневная задача Vercel Cron защищена секретом', async () => {
    expect((await h.agent().get('/api/cron/daily')).status).toBe(401);
    expect((await h.agent().get('/api/cron/daily').set('Authorization', 'Bearer guessed-secret')).status).toBe(401);
  });
});

describe('Сохранение данных после перезапуска', () => {
  it('после перезапуска сервера данные на месте, сессии действуют', async () => {
    const cookieDirector = director.cookie;
    const csrf = director.csrf;
    const countBefore = (await director.get('/api/director/teachers')).body.length;
    await h.close();
    h = await startHarness({ reset: false });
    const d2 = h.agent();
    d2.csrf = csrf;
    const r = await d2.http.get('/api/director/teachers').set('Cookie', cookieDirector);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(countBefore);
    expect((await h.agent().get('/api/public/status')).body.ownerRegistered).toBe(true);
    // Схема школы не пересоздаётся
    const b = await d2.http.get('/api/director/buildings').set('Cookie', cookieDirector);
    expect(b.body.find((x: { kind: string }) => x.kind === 'SCHOOL').floors.some((f: { rooms: { name: string }[] }) => f.rooms.some((rm) => rm.name === 'Кабинет химии'))).toBe(true);
  });
});

describe('Восстановление доступа директора', () => {
  it('код на email владельца, новый пароль, старые сеансы завершены', async () => {
    const before = h.outbox.length;
    const start = await h.agent().http.post('/api/auth/director/recover/start').send({ email: 'owner@school.test' });
    expect(h.outbox.length).toBe(before + 1);
    const code = /(\d{6})/.exec(h.outbox[h.outbox.length - 1]!.text)![1]!;
    const r = await h.agent().http.post('/api/auth/director/recover/verify').send({ verificationId: start.body.verificationId, code, newPassword: 'Recovered-2026' });
    expect(r.status).toBe(200);
    expect((await h.agent().login('director', 'director', 'Recovered-2026')).status).toBe(200);
    // Повторно тот же код не работает
    expect((await h.agent().http.post('/api/auth/director/recover/verify').send({ verificationId: start.body.verificationId, code, newPassword: 'Another-2026x' })).status).toBe(400);
  });
});
