import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Требуется вход в систему') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Не найдено') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first?.message ?? 'Некорректные данные', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;
/** Оборачивает async-обработчик, чтобы ошибки уходили в общий обработчик. */
export const ah =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? 'Некорректные данные', code: 'BAD_REQUEST' });
    return;
  }
  const anyErr = err as { code?: string; type?: string; status?: number };
  if (anyErr?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Файл слишком большой', code: 'FILE_TOO_LARGE' });
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Слишком большой запрос', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Некорректный JSON', code: 'BAD_REQUEST' });
    return;
  }
  if (anyErr?.code === 'P2002') {
    res.status(409).json({ error: 'Запись с такими данными уже существует', code: 'CONFLICT' });
    return;
  }
  if (anyErr?.code === 'P2025') {
    res.status(404).json({ error: 'Не найдено', code: 'NOT_FOUND' });
    return;
  }
  logger.error('Необработанная ошибка', { path: req.path, method: req.method, err: String((err as Error)?.stack ?? err) });
  res.status(500).json({ error: 'Внутренняя ошибка сервера', code: 'INTERNAL' });
}
