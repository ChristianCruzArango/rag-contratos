import { Logger } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrEngine, OcrPageResult } from '../ocr.types.js';

/**
 * OCR local con Tesseract (WASM). No requiere API key ni envía las páginas a
 * ningún servicio externo, lo que importa cuando los documentos son
 * confidenciales. La primera ejecución descarga el modelo de idioma (~11 MB)
 * y lo cachea en `cachePath`.
 */
export class TesseractEngine implements OcrEngine {
  readonly name = 'tesseract' as const;
  private readonly logger = new Logger(TesseractEngine.name);
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;

  constructor(
    private readonly langs = 'spa',
    private readonly cachePath = './.cache/tessdata',
  ) {}

  /** El worker se crea una sola vez y se reutiliza entre páginas. */
  private async getWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    this.starting ??= (async () => {
      this.logger.log(`Iniciando Tesseract (idiomas: ${this.langs})…`);
      const w = await createWorker(this.langs, 1, {
        cachePath: this.cachePath,
      });
      this.worker = w;
      return w;
    })();
    return this.starting;
  }

  async recognize(image: Buffer, page: number): Promise<OcrPageResult> {
    const worker = await this.getWorker();
    const t0 = Date.now();
    const { data } = await worker.recognize(image);
    return {
      page,
      text: data.text.trim(),
      confidence: data.confidence,
      engine: this.name,
      durationMs: Date.now() - t0,
    };
  }

  async dispose() {
    await this.worker?.terminate();
    this.worker = null;
    this.starting = null;
  }
}
