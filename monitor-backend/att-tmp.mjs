import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const mode = process.argv[2];
const u = await p.user.findFirst({ where: { login: 'akhmedov.n' }, include: { teacher: true } });
const date = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
if (mode === 'add') { await p.attendance.create({ data: { teacherId: u.teacher.id, date, checkInAt: new Date() } }); console.log('added', date); }
else { const r = await p.attendance.deleteMany({ where: { teacherId: u.teacher.id, date, checkOutAt: null } }); console.log('removed', r.count); }
await p.$disconnect();
