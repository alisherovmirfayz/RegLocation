// Тесты веб-сервера проекта №2: маршруты, редиректы .html, прокси к backend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './server.mjs';

let upstream, server, base;

before(async () => {
  upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ path: req.url, method: req.method, host: req.headers['x-forwarded-host'] ?? null, status: 'ok' }));
  });
  await new Promise((r) => upstream.listen(0, r));
  const dist = mkdtempSync(path.join(tmpdir(), 'rl-dist-'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>RegLocation</title>');
  mkdirSync(path.join(dist, 'assets'));
  const { app, proxy } = createApp({ upstream: `http://127.0.0.1:${upstream.address().port}`, distDir: dist });
  server = createServer(app);
  server.on('upgrade', proxy.upgrade);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  upstream.close();
});

test('корень ведёт на /teacher', async () => {
  const r = await fetch(base + '/', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/teacher');
});

for (const p of ['/teacher', '/director', '/director/login', '/director/register', '/director/teachers']) {
  test(`SPA-маршрут ${p}`, async () => {
    const r = await fetch(base + p);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /RegLocation/);
  });
}

test('старые адреса с .html перенаправляются', async () => {
  for (const [from, to] of [['/teacher.html', '/teacher'], ['/director/login.html', '/director/login'], ['/director/register.html', '/director/register']]) {
    const r = await fetch(base + from, { redirect: 'manual' });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), to);
  }
});

test('API проксируется на backend', async () => {
  const r = await fetch(base + '/api/public/status', { method: 'GET' });
  const body = await r.json();
  assert.equal(body.path, '/api/public/status');
  assert.ok(body.host);
});

test('POST с телом проходит через прокси', async () => {
  const r = await fetch(base + '/api/auth/teacher/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"login":"a"}' });
  assert.equal((await r.json()).method, 'POST');
});

test('healthz', async () => {
  const r = await fetch(base + '/healthz');
  assert.deepEqual(await r.json(), { status: 'ok', api: 'ok' });
});
