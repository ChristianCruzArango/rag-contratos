import { Injectable, computed, signal } from '@angular/core';
import type { EventoDe, Fase, PipelineEvent } from './pipeline.models';

/** Los siete pasos del acto de ingesta, en orden. */
export const PASOS_INGESTA = [
  'recepcion',
  'extraccion',
  'ocr-plan',
  'troceo',
  'embeddings-lote',
  'almacenado',
  'ingesta-lista',
] as const satisfies readonly Fase[];

/** Los seis pasos del acto de consulta, en orden. */
export const PASOS_CONSULTA = [
  'consulta-embedding',
  'busqueda-vectorial',
  'busqueda-lexica',
  'fusion',
  'prompt',
  'respuesta-lista',
] as const satisfies readonly Fase[];

/** Qué contarle al lector en cada fase. */
const LEYENDA: Partial<Record<Fase, string>> = {
  recepcion: 'Recibiendo el archivo',
  extraccion: 'Leyendo las páginas',
  'ocr-plan': 'Preparando el OCR',
  'ocr-pagina': 'Reconociendo páginas',
  'ocr-resumen': 'Cerrando el OCR',
  troceo: 'Partiendo en fragmentos',
  'embeddings-lote': 'Generando vectores',
  almacenado: 'Escribiendo en pgvector',
  'ingesta-lista': 'Documento indexado',
  consulta: 'Preparando la consulta',
  'consulta-embedding': 'Vectorizando la pregunta',
  'busqueda-vectorial': 'Buscando por significado',
  'busqueda-lexica': 'Buscando literalmente',
  fusion: 'Fusionando las dos listas',
  prompt: 'Armando el prompt',
  citas: 'Reuniendo las citas',
  token: 'Escribiendo la respuesta',
  'respuesta-lista': 'Respuesta lista',
};

/**
 * Estado del pipeline, alimentado exclusivamente por los eventos del backend.
 *
 * No hay nada aquí que el servidor no haya medido: las cifras que la interfaz
 * anima son las mismas que quedaron en la base de datos.
 */
@Injectable({ providedIn: 'root' })
export class PipelineStore {
  // ── Acto I · Ingesta ──────────────────────────────────────────────────────
  readonly recepcion = signal<EventoDe<'recepcion'> | null>(null);
  readonly extraccion = signal<EventoDe<'extraccion'> | null>(null);
  readonly ocrPlan = signal<EventoDe<'ocr-plan'> | null>(null);
  readonly ocrPaginas = signal<EventoDe<'ocr-pagina'>[]>([]);
  readonly ocrResumen = signal<EventoDe<'ocr-resumen'> | null>(null);
  readonly troceo = signal<EventoDe<'troceo'> | null>(null);
  readonly lotes = signal<EventoDe<'embeddings-lote'>[]>([]);
  readonly almacenado = signal<EventoDe<'almacenado'> | null>(null);
  readonly ingestaLista = signal<EventoDe<'ingesta-lista'> | null>(null);

  // ── Acto II · Consulta ────────────────────────────────────────────────────
  readonly consulta = signal<EventoDe<'consulta'> | null>(null);
  readonly consultaEmbedding = signal<EventoDe<'consulta-embedding'> | null>(null);
  readonly vectorial = signal<EventoDe<'busqueda-vectorial'> | null>(null);
  readonly lexica = signal<EventoDe<'busqueda-lexica'> | null>(null);
  readonly fusion = signal<EventoDe<'fusion'> | null>(null);
  readonly prompt = signal<EventoDe<'prompt'> | null>(null);
  readonly citas = signal<EventoDe<'citas'> | null>(null);
  readonly respuesta = signal('');
  readonly respuestaLista = signal<EventoDe<'respuesta-lista'> | null>(null);

  // ── Control ───────────────────────────────────────────────────────────────
  readonly faseActual = signal<Fase | null>(null);
  readonly indexando = signal(false);
  readonly consultando = signal(false);
  readonly error = signal<string | null>(null);

  /** Último vector visto: alimenta la tira de colores de la cabecera. */
  readonly ultimoVector = computed<number[]>(() => {
    const lote = this.lotes().at(-1);
    return this.consultaEmbedding()?.muestra ?? lote?.muestra ?? [];
  });

  /** Progreso del acto de ingesta (0–7), para el margen numerado. */
  readonly pasoIngesta = computed(() => {
    const alcanzado = PASOS_INGESTA.filter((p) => this.hecho(p)).length;
    return alcanzado;
  });

  readonly pasoConsulta = computed(() => PASOS_CONSULTA.filter((p) => this.hecho(p)).length);

  readonly totalEmbebidos = computed(() => this.lotes().at(-1)?.hechos ?? 0);

  /** ¿Hay algo en marcha ahora mismo? */
  readonly trabajando = computed(() => this.indexando() || this.consultando());

  /**
   * En qué punto está el recorrido, para el indicador del margen.
   * Distingue lo que la interfaz no distinguía: trabajando, terminado y roto.
   */
  readonly marcha = computed<'reposo' | 'trabajando' | 'listo' | 'fallo'>(() => {
    if (this.error()) return 'fallo';
    if (this.trabajando()) return 'trabajando';
    // Sin citas no hubo respuesta que celebrar: se marca como reposo para que
    // el visto verde no prometa algo que no ocurrió.
    if (this.respuestaLista()) {
      return this.citas()?.citas.length ? 'listo' : 'reposo';
    }
    if (this.ingestaLista()) return 'listo';
    return 'reposo';
  });

  /** Qué se está haciendo, dicho en una línea. */
  readonly loQueHace = computed(() => {
    const fase = this.faseActual();
    if (this.error()) return 'Algo falló';
    if (!this.trabajando()) {
      if (this.respuestaLista()) {
        // Terminar y encontrar algo no es lo mismo: si la búsqueda vuelve
        // vacía el recorrido acaba igual, pero decir «lista» sería engañoso.
        return this.citas()?.citas.length ? 'Respuesta lista' : 'Terminó sin encontrar nada';
      }
      if (this.ingestaLista()) {
        return this.ingestaLista()!.omitido ? 'Ya estaba indexado' : 'Documento indexado';
      }
      return 'Sin nada en marcha';
    }
    return fase ? (LEYENDA[fase] ?? 'Trabajando') : 'Trabajando';
  });

  /** El tiempo que tardó, cuando ya terminó. */
  readonly cuantoTardo = computed(() => {
    if (this.trabajando()) return null;
    const ms = this.respuestaLista()?.ms ?? this.ingestaLista()?.ms;
    return ms === undefined ? null : `${(ms / 1000).toFixed(1)} s`;
  });

  /** ¿Este documento necesitó OCR? */
  readonly necesitoOcr = computed(() => (this.ocrPlan()?.objetivo.length ?? 0) > 0);

  /** Registra un evento del backend en el estado. */
  aplicar(evento: PipelineEvent): void {
    this.faseActual.set(evento.fase);

    switch (evento.fase) {
      case 'recepcion':
        return this.recepcion.set(evento);
      case 'extraccion':
        return this.extraccion.set(evento);
      case 'ocr-plan':
        return this.ocrPlan.set(evento);
      case 'ocr-pagina':
        return this.ocrPaginas.update((p) => [...p, evento]);
      case 'ocr-resumen':
        return this.ocrResumen.set(evento);
      case 'troceo':
        return this.troceo.set(evento);
      case 'embeddings-lote':
        return this.lotes.update((l) => [...l, evento]);
      case 'almacenado':
        return this.almacenado.set(evento);
      case 'ingesta-lista':
        return this.ingestaLista.set(evento);
      case 'consulta':
        return this.consulta.set(evento);
      case 'consulta-embedding':
        return this.consultaEmbedding.set(evento);
      case 'busqueda-vectorial':
        return this.vectorial.set(evento);
      case 'busqueda-lexica':
        return this.lexica.set(evento);
      case 'fusion':
        return this.fusion.set(evento);
      case 'prompt':
        return this.prompt.set(evento);
      case 'citas':
        return this.citas.set(evento);
      case 'token':
        return this.respuesta.update((t) => t + evento.texto);
      case 'respuesta-lista':
        return this.respuestaLista.set(evento);
      case 'error':
        return this.error.set(evento.mensaje);
    }
  }

  reiniciarIngesta(): void {
    this.recepcion.set(null);
    this.extraccion.set(null);
    this.ocrPlan.set(null);
    this.ocrPaginas.set([]);
    this.ocrResumen.set(null);
    this.troceo.set(null);
    this.lotes.set([]);
    this.almacenado.set(null);
    this.ingestaLista.set(null);
    this.error.set(null);
    this.faseActual.set(null);
  }

  reiniciarConsulta(): void {
    this.consulta.set(null);
    this.consultaEmbedding.set(null);
    this.vectorial.set(null);
    this.lexica.set(null);
    this.fusion.set(null);
    this.prompt.set(null);
    this.citas.set(null);
    this.respuesta.set('');
    this.respuestaLista.set(null);
    this.error.set(null);
    this.faseActual.set(null);
  }

  /** ¿Se alcanzó ya esta fase? */
  private hecho(fase: Fase): boolean {
    switch (fase) {
      case 'recepcion':
        return this.recepcion() !== null;
      case 'extraccion':
        return this.extraccion() !== null;
      case 'ocr-plan':
        return this.ocrPlan() !== null;
      case 'troceo':
        return this.troceo() !== null;
      case 'embeddings-lote':
        return this.lotes().length > 0;
      case 'almacenado':
        return this.almacenado() !== null;
      case 'ingesta-lista':
        return this.ingestaLista() !== null;
      case 'consulta-embedding':
        return this.consultaEmbedding() !== null;
      case 'busqueda-vectorial':
        return this.vectorial() !== null;
      case 'busqueda-lexica':
        return this.lexica() !== null;
      case 'fusion':
        return this.fusion() !== null;
      case 'prompt':
        return this.prompt() !== null;
      case 'respuesta-lista':
        return this.respuestaLista() !== null;
      default:
        return false;
    }
  }
}
