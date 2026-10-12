import { createRequire } from 'node:module';
import path from 'node:path';

export interface PdfTextItem {
  text: string;
  /** Координаты в пикселях отрендеренной страницы */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPage {
  png: Buffer;
  width: number;
  height: number;
  textItems: PdfTextItem[];
}

const require = createRequire(import.meta.url);

let pdfjsPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

function pdfjsDir() {
  return path.dirname(require.resolve('pdfjs-dist/package.json'));
}

/**
 * Рендерит страницы PDF в PNG (ширина ≈ targetWidth) и извлекает текстовый слой с координатами.
 */
export async function renderPdf(data: Buffer, opts: { maxPages: number; targetWidth?: number }): Promise<{ pages: PdfPage[]; totalPages: number }> {
  const pdfjs = await loadPdfjs();
  const dir = pdfjsDir();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    // В Node.js pdfjs читает эти файлы через fs.readFile, поэтому передаём обычный путь.
    standardFontDataUrl: `${path.join(dir, 'standard_fonts').replace(/\\/g, '/')}/`,
    cMapUrl: `${path.join(dir, 'cmaps').replace(/\\/g, '/')}/`,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  const count = Math.min(doc.numPages, opts.maxPages);
  try {
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(1, (opts.targetWidth ?? 2400) / base.width));
      const viewport = page.getViewport({ scale });
      const factory = doc.canvasFactory as {
        create(w: number, h: number): { canvas: { toBuffer(mime: string): Buffer }; context: unknown };
        destroy(c: unknown): void;
      };
      const cc = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = cc.context as { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void };
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: cc.canvas as never, canvasContext: cc.context as never, viewport }).promise;
      const png = cc.canvas.toBuffer('image/png');

      const content = await page.getTextContent();
      const textItems: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const tx = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
        const fontH = Math.hypot(tx[2]!, tx[3]!);
        textItems.push({
          text: item.str,
          x: tx[4]!,
          y: tx[5]! - fontH,
          width: item.width * scale,
          height: fontH,
        });
      }
      pages.push({ png, width: Math.ceil(viewport.width), height: Math.ceil(viewport.height), textItems });
      factory.destroy(cc);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { pages, totalPages: doc.numPages };
}
