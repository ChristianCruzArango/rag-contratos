import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Las variables de entorno de la aplicación, validadas al arrancar.
 *
 * Ésta es la **única** fuente de verdad: ningún servicio ni fábrica de
 * configuración escribe un valor por defecto propio. Si algo obligatorio falta,
 * el proceso no arranca y dice exactamente qué falta, en vez de arrancar con un
 * valor inventado y fallar más tarde en un sitio que no lo explica.
 *
 * Lo que aquí lleva un valor inicial es un ajuste con default razonable; lo que
 * no lo lleva es obligatorio en el `.env`.
 */
export class EnvironmentVariables {
  // ── Servidor ──────────────────────────────────────────────────────────────
  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(aEntero)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  // ── Base de datos ─────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // ── Generación (OpenRouter) ───────────────────────────────────────────────
  /** Puede ir vacía: sin ella el resto del recorrido funciona, sólo falla /ask. */
  @IsString()
  OPENROUTER_API_KEY = '';

  @IsString()
  @IsNotEmpty()
  OPENROUTER_BASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  OPENROUTER_MODEL!: string;

  @IsString()
  OPENROUTER_SITE_URL = '';

  @IsString()
  OPENROUTER_SITE_NAME = '';

  // ── Embeddings ────────────────────────────────────────────────────────────
  /** Vacío = se decide solo: local si no hay API key. */
  @IsIn(['', 'local', 'openai'])
  EMBEDDING_PROVIDER = '';

  @IsString()
  @IsNotEmpty()
  EMBEDDING_LOCAL_MODEL!: string;

  @IsString()
  @IsNotEmpty()
  EMBEDDING_BASE_URL!: string;

  @IsString()
  EMBEDDING_API_KEY = '';

  @IsString()
  @IsNotEmpty()
  EMBEDDING_MODEL!: string;

  @IsInt()
  @Min(1)
  @Transform(aEntero)
  EMBEDDING_DIMENSIONS!: number;

  @IsInt()
  @Min(1)
  @Transform(aEntero)
  EMBEDDING_BATCH_SIZE = 64;

  // ── OCR ───────────────────────────────────────────────────────────────────
  @IsBoolean()
  @Transform(aBooleano)
  OCR_ENABLED = true;

  @IsIn(['auto', 'force', 'never'])
  OCR_MODE = 'auto';

  @IsIn(['tesseract', 'vision'])
  OCR_ENGINE = 'tesseract';

  @IsString()
  @IsNotEmpty()
  OCR_LANGS!: string;

  @IsString()
  @IsNotEmpty()
  OCR_CACHE_PATH!: string;

  @IsInt()
  @Min(0)
  @Transform(aEntero)
  OCR_MIN_CHARS = 120;

  @IsNumber()
  @Min(0.5)
  @Transform(aNumero)
  OCR_SCALE = 2;

  @IsInt()
  @Min(1)
  @Transform(aEntero)
  OCR_CONCURRENCY = 2;

  @IsInt()
  @Min(0)
  @Max(100)
  @Transform(aEntero)
  OCR_MIN_CONFIDENCE = 60;

  @IsInt()
  @Min(1)
  @Transform(aEntero)
  OCR_MAX_PAGES = 50;

  @IsString()
  @IsNotEmpty()
  OCR_VISION_MODEL!: string;

  // ── Recuperación ──────────────────────────────────────────────────────────
  @IsInt()
  @Min(100)
  @Transform(aEntero)
  CHUNK_SIZE = 1200;

  @IsInt()
  @Min(0)
  @Transform(aEntero)
  CHUNK_OVERLAP = 200;

  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(aEntero)
  RAG_TOP_K = 8;

  @IsNumber()
  @Min(0)
  @Transform(aNumero)
  RAG_MIN_SCORE = 0;
}

let validadas: EnvironmentVariables | null = null;

/**
 * Valida el entorno al arrancar. La llama `ConfigModule.forRoot({ validate })`.
 * Si algo falla, lanza con la lista completa de problemas.
 */
export function validate(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errores = validateSync(config, { skipMissingProperties: false });
  if (errores.length) {
    const detalle = errores
      .map(
        (e) =>
          `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(
      `Configuración inválida. Revisa el .env:\n${detalle}\n` +
        'Hay un .env.example con todas las variables.',
    );
  }

  validadas = config;
  return config;
}

/** El entorno ya validado. Es lo único que leen las fábricas de configuración. */
export function env(): EnvironmentVariables {
  if (!validadas) {
    throw new Error('Se pidió la configuración antes de validar el entorno.');
  }
  return validadas;
}

// ── Conversiones desde el texto plano del .env ──────────────────────────────

function aEntero({ value }: { value: unknown }): unknown {
  return value === undefined || value === ''
    ? undefined
    : parseInt(String(value), 10);
}

function aNumero({ value }: { value: unknown }): unknown {
  return value === undefined || value === ''
    ? undefined
    : parseFloat(String(value));
}

function aBooleano({ value }: { value: unknown }): unknown {
  if (value === undefined || value === '') return undefined;
  return String(value) !== 'false';
}
