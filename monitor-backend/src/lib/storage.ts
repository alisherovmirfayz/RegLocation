import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient, StoredFile } from '@prisma/client';
import type { AppConfig } from '../config';
import { sha256 } from './credentials';

/**
 * Хранилище файлов. Никогда не использует локальный диск контейнера (он временный).
 *  - database: файлы в PostgreSQL (bytea) — работает «из коробки», данные переживают деплой;
 *  - s3: любое S3-совместимое объектное хранилище (Cloudflare R2, Backblaze B2, AWS S3 …).
 */
export class FileStorage {
  private s3: S3Client | null = null;

  constructor(
    private prisma: PrismaClient,
    private config: AppConfig,
  ) {
    if (config.STORAGE_DRIVER === 's3') {
      this.s3 = new S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT || undefined,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
      });
    }
  }

  async save(opts: { purpose: string; mimeType: string; data: Buffer; ownerUserId?: string | null }): Promise<StoredFile> {
    const hash = sha256(opts.data);
    if (this.s3) {
      const objectKey = `${opts.purpose}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: objectKey, Body: opts.data, ContentType: opts.mimeType }),
      );
      return this.prisma.storedFile.create({
        data: { purpose: opts.purpose, mimeType: opts.mimeType, size: opts.data.length, sha256: hash, driver: 'S3', objectKey, ownerUserId: opts.ownerUserId ?? null },
      });
    }
    return this.prisma.storedFile.create({
      data: {
        purpose: opts.purpose,
        mimeType: opts.mimeType,
        size: opts.data.length,
        sha256: hash,
        driver: 'DATABASE',
        data: new Uint8Array(opts.data),
        ownerUserId: opts.ownerUserId ?? null,
      },
    });
  }

  async read(id: string): Promise<{ file: StoredFile; data: Buffer } | null> {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) return null;
    if (file.driver === 'DATABASE') return { file, data: Buffer.from(file.data ?? []) };
    if (!this.s3) throw new Error('Файл хранится в S3, но S3 не настроен');
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: file.objectKey! }));
    const bytes = await out.Body!.transformToByteArray();
    return { file, data: Buffer.from(bytes) };
  }

  async remove(id: string): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({ where: { id }, select: { id: true, driver: true, objectKey: true } });
    if (!file) return;
    if (file.driver === 'S3' && this.s3 && file.objectKey) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: file.objectKey })).catch(() => undefined);
    }
    await this.prisma.storedFile.delete({ where: { id } }).catch(() => undefined);
  }
}
