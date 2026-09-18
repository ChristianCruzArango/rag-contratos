import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import { LlmService } from '../llm/llm.service.js';
import { TesseractEngine } from './engines/tesseract.engine.js';
import { VisionEngine } from './engines/vision.engine.js';
import type {
  OcrEngine,
  OcrPageResult,
  OcrPdfInput,
  OcrPdfOutput,
  OcrReport,
} from './ocr.types.js';

@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private engine: OcrEngine | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>('ocr.enabled')!;
  }
  get mode(): 'auto' | 'force' | 'never' {
    return this.config.get<'auto' | 'force' | 'never'>('ocr.mode')!;
  }

  onModuleInit() {
    if (!this.enabled || this.mode === 'never') {
      this.logger.log('OCR deshabilitado');
      return;
    }
    const name = this.config.get<string>('ocr.engine')!;
    this.engine =
      name === 'vision'
        ? new VisionEngine(
            this.llm,
            this.config.get<string>('ocr.visionModel')!,
          )
        : new TesseractEngine(
            this.config.get<string>('ocr.langs')!,
            this.config.get<string>('ocr.cachePath')!,
          );
    this.logger.log(
      `OCR activo — motor: ${this.engine.name}, modo: ${this.mode}`,
    );
  }

  async onModuleDestroy() {
    await this.engine?.dispose?.();
  }

  /** OCR de una imagen suelta (png/jpg/tiff subida por el usuario). */
  async recognizeImage(image: Buffer): Promise<OcrPageResult> {
    if (!this.engine) {
      throw new Error('OCR deshabilitado: activa OCR_ENABLED en el .env');
    }
    return this.engine.recognize(image, 1);
  }

  /**
   * Completa con OCR las páginas de un PDF que no tienen capa de texto
   * aprovechable.
   *
   * En modo `auto` solo se rasterizan las páginas cuyo texto extraído no llega
   * a `OCR_MIN_CHARS`: un PDF nativo no paga OCR, y un escaneo lo paga solo en
   * las páginas que lo necesitan. En modo `force` se procesan todas (útil
   * cuando el PDF trae una capa de texto basura de un OCR previo malo).
   */
  async ocrPdfPages(input: OcrPdfInput): Promise<OcrPdfOutput> {
    const t0 = Date.now();
    const pages = [...input.pages];
    const base: OcrReport = {
      aplicado: false,
      motor: null,
      modo: this.mode,
      paginas_ocr: [],
      paginas_totales: pages.length,
      confianza_media: null,
      paginas_baja_confianza: [],
      duracion_ms: 0,
      omitidas_por_limite: 0,
    };

    const minChars = this.config.get<number>('ocr.minChars')!;
    const avisar = input.report;

    if (!this.engine || this.mode === 'never') {
      avisar?.({
        fase: 'ocr-plan',
        modo: this.mode,
        motor: null,
        minChars,
        objetivo: [],
        omitidas: 0,
        innecesario: true,
      });
      return { pages, report: base };
    }

    const objetivo =
      this.mode === 'force'
        ? pages.map((_, i) => i + 1)
        : pages
            .map((t, i) => ({ n: i + 1, len: t.replace(/\s/g, '').length }))
            .filter((p) => p.len < minChars)
            .map((p) => p.n);

    if (objetivo.length === 0) {
      avisar?.({
        fase: 'ocr-plan',
        modo: this.mode,
        motor: this.engine.name,
        minChars,
        objetivo: [],
        omitidas: 0,
        innecesario: true,
      });
      return { pages, report: base };
    }

    const maxPages = this.config.get<number>('ocr.maxPages')!;
    const aProcesar = objetivo.slice(0, maxPages);
    base.omitidas_por_limite = objetivo.length - aProcesar.length;

    this.logger.log(
      `OCR sobre ${aProcesar.length}/${pages.length} páginas (motor ${this.engine.name})`,
    );
    avisar?.({
      fase: 'ocr-plan',
      modo: this.mode,
      motor: this.engine.name,
      minChars,
      objetivo: aProcesar,
      omitidas: base.omitidas_por_limite,
      innecesario: false,
    });

    const pdf = await getDocumentProxy(new Uint8Array(input.buffer));
    const scale = this.config.get<number>('ocr.scale')!;
    const minConfidence = this.config.get<number>('ocr.minConfidence')!;
    const concurrency = this.config.get<number>('ocr.concurrency')!;

    const resultados: OcrPageResult[] = [];
    // Tanda a tanda para no disparar la memoria: cada página rasterizada a
    // escala 2 ocupa varios MB.
    for (let i = 0; i < aProcesar.length; i += concurrency) {
      const tanda = aProcesar.slice(i, i + concurrency);
      const hechos = await Promise.all(
        tanda.map(async (n) => {
          try {
            const png = await renderPageAsImage(pdf, n, {
              canvasImport: () => import('@napi-rs/canvas'),
              scale,
            });
            const r = await this.engine!.recognize(Buffer.from(png), n);
            avisar?.({
              fase: 'ocr-pagina',
              pagina: r.page,
              confianza: r.confidence,
              caracteres: r.text.length,
              ms: r.durationMs,
              muestra: r.text.replace(/\s+/g, ' ').trim().slice(0, 260),
            });
            return r;
          } catch (err) {
            this.logger.warn(
              `OCR falló en la página ${n}: ${(err as Error).message}`,
            );
            return null;
          }
        }),
      );
      resultados.push(...hechos.filter((r): r is OcrPageResult => r !== null));
    }

    for (const r of resultados) {
      if (!r.text) continue;
      // En modo auto se completa la página vacía; en force, se reemplaza.
      pages[r.page - 1] = r.text;
      base.paginas_ocr.push(r.page);
      if (r.confidence !== null && r.confidence < minConfidence) {
        base.paginas_baja_confianza.push(r.page);
      }
    }

    const confianzas = resultados
      .map((r) => r.confidence)
      .filter((c): c is number => c !== null);

    base.aplicado = base.paginas_ocr.length > 0;
    base.motor = this.engine.name;
    base.confianza_media = confianzas.length
      ? Number(
          (confianzas.reduce((a, b) => a + b, 0) / confianzas.length).toFixed(
            1,
          ),
        )
      : null;
    base.duracion_ms = Date.now() - t0;

    if (base.paginas_baja_confianza.length) {
      this.logger.warn(
        `OCR de baja confianza (<${minConfidence}) en las páginas: ${base.paginas_baja_confianza.join(', ')}`,
      );
    }

    avisar?.({ fase: 'ocr-resumen', informe: base });

    return { pages, report: base };
  }
}
