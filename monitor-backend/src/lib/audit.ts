import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { clientIp } from '../auth/sessions';

export interface AuditEntry {
  action: string;
  summary: string;
  targetType?: string;
  targetId?: string;
  details?: Prisma.InputJsonValue;
}

/** Записывает действие в журнал и уведомляет кабинеты директоров в реальном времени. */
export async function audit(ctx: AppContext, req: Request | null, entry: AuditEntry) {
  const user = req?.auth?.user;
  const row = await ctx.prisma.auditLog.create({
    data: {
      actorUserId: user?.id ?? null,
      actorRole: req?.auth?.role ?? 'SYSTEM',
      actorName: user ? `${user.lastName} ${user.firstName}`.trim() : 'Система',
      action: entry.action,
      summary: entry.summary,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details,
      ip: req ? clientIp(req) : null,
    },
  });
  ctx.live.emitToDirectors('audit:new', row);
  return row;
}
