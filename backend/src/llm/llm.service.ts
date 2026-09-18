import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatMessage } from './llm.types.js';

/** Generación de respuestas a través de OpenRouter (API compatible con OpenAI). */
@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private client!: OpenAI;
  private model!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const baseURL = this.config.get<string>('openrouter.baseUrl')!;
    const apiKey = this.config.get<string>('openrouter.apiKey')!;
    this.model = this.config.get<string>('openrouter.model')!;

    if (!apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY vacío: /rag/ask fallará hasta que lo configures en .env',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        // Cabeceras opcionales que OpenRouter usa para atribución
        'HTTP-Referer': this.config.get<string>('openrouter.siteUrl') ?? '',
        'X-Title': this.config.get<string>('openrouter.siteName') ?? '',
      },
    });
    this.logger.log(`LLM: ${this.model} @ ${baseURL}`);
  }

  async chat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature,
    });
    return res.choices[0]?.message?.content ?? '';
  }

  /**
   * Envía una imagen a un modelo con visión y devuelve su lectura.
   * Lo usa el motor de OCR `vision`; requiere un modelo multimodal.
   */
  async readImage(
    dataUrl: string,
    prompt: string,
    model = this.model,
    temperature = 0,
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model,
      temperature,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }

  /** Respuesta en streaming, token a token (para SSE). */
  async *chatStream(
    messages: ChatMessage[],
    temperature = 0.2,
  ): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature,
      stream: true,
    });
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
