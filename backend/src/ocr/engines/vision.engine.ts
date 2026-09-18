import { Logger } from '@nestjs/common';
import type { LlmService } from '../../llm/llm.service.js';
import type { OcrEngine, OcrPageResult } from '../ocr.types.js';

const PROMPT = `Transcribe TODO el texto de esta página de un documento legal, respetando el orden de lectura, la numeración de cláusulas y los saltos de párrafo.

Reglas:
- Transcribe literalmente: no resumas, no corrijas, no completes lo que no se lee.
- Conserva cifras, fechas, NIT, números de cédula y de cláusula exactamente como aparecen.
- Las tablas se transcriben fila por fila, separando las columnas con " | ".
- Si un fragmento es ilegible, escribe [ilegible] en su lugar.
- Devuelve solo la transcripción, sin comentarios ni explicaciones.`;

/**
 * OCR mediante un modelo de visión a través de OpenRouter.
 *
 * Lee mejor que Tesseract las tablas, los sellos, las firmas y los escaneos
 * torcidos o de baja calidad, pero cuesta dinero por página, es más lento y
 * —al ser un modelo generativo— puede "normalizar" lo que no se lee bien.
 * Por eso el prompt le prohíbe completar y le exige marcar [ilegible].
 */
export class VisionEngine implements OcrEngine {
  readonly name = 'vision' as const;
  private readonly logger = new Logger(VisionEngine.name);

  constructor(
    private readonly llm: LlmService,
    private readonly model: string,
  ) {}

  async recognize(image: Buffer, page: number): Promise<OcrPageResult> {
    const t0 = Date.now();
    const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
    const text = await this.llm.readImage(dataUrl, PROMPT, this.model);
    return {
      page,
      text: text.trim(),
      confidence: null, // un VLM no reporta confianza por carácter
      engine: this.name,
      durationMs: Date.now() - t0,
    };
  }
}
