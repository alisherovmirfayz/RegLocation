import type { PrismaClient } from '@prisma/client';
import type { Server as IOServer } from 'socket.io';
import type { AppConfig } from './config';
import type { Mailer } from './lib/mail';
import type { FileStorage } from './lib/storage';
import type { SettingsService } from './domain/settings';
import type { LiveService } from './domain/live';
import type { OcrService } from './ocr/service';

export interface Clock {
  now(): Date;
}

export interface AppContext {
  config: AppConfig;
  prisma: PrismaClient;
  mailer: Mailer;
  storage: FileStorage;
  clock: Clock;
  settings: SettingsService;
  live: LiveService;
  ocr: OcrService;
  io: IOServer | null;
}

export type Role = 'DIRECTOR' | 'TEACHER' | 'RECEPTION';
