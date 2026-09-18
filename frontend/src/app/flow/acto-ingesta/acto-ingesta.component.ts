import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PipelineStore } from '../../core/pipeline/pipeline.store';
import { RagService } from '../../core/rag/rag.service';
import { PasoComponent } from '../../ui/paso/paso.component';
import { CifraComponent } from '../../ui/cifra/cifra.component';
import { PageGridComponent } from '../../viz/page-grid/page-grid.component';
import { ChunkRiverComponent } from '../../viz/chunk-river/chunk-river.component';
import { VectorSpaceComponent } from '../../viz/vector-space/vector-space.component';
import { HnswGraphComponent } from '../../viz/hnsw-graph/hnsw-graph.component';
import { EmbeddingForgeComponent } from '../../viz/embedding-forge/embedding-forge.component';
import { ChunkRowComponent } from '../../viz/chunk-row/chunk-row.component';
import { EstadoComponent } from '../../ui/estado/estado.component';
import { PasoEstadoComponent } from '../../ui/paso-estado/paso-estado.component';
import type { EspacioVectorial } from '../../core/pipeline/pipeline.models';
import type { EsquemaTabla, RagStats } from '../../core/rag/rag.models';
import { pedir } from '../../core/carga/carga';
import { type Carga, dato, reposo } from '../../core/carga/carga.models';

@Component({
  selector: 'app-acto-ingesta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    PasoComponent,
    CifraComponent,
    PageGridComponent,
    ChunkRiverComponent,
    VectorSpaceComponent,
    HnswGraphComponent,
    EmbeddingForgeComponent,
    ChunkRowComponent,
    EstadoComponent,
    PasoEstadoComponent,
  ],
  templateUrl: './acto-ingesta.component.html',
  styleUrl: '../acto.scss',
})
export class ActoIngestaComponent {
  protected readonly store = inject(PipelineStore);
  protected readonly stats = signal<Carga<RagStats>>(reposo());
  /** El esquema de `chunks` tal como lo describe Postgres ahora mismo. */
  protected readonly esquema = signal<Carga<EsquemaTabla>>(reposo());
  protected readonly arrastrando = signal(false);
  protected readonly espacio = signal<Carga<EspacioVectorial>>(reposo());

  private readonly rag = inject(RagService);

  /** Dimensión del vector: la del índice, o la del último lote indexado. */
  protected readonly dimensiones = computed(
    () => this.ultimoLote()?.dimensiones ?? dato(this.stats())?.dimensiones ?? 0,
  );

  /** El esquema ya recibido, para las plantillas. */
  protected readonly esquemaDato = computed(() => dato(this.esquema()));
  protected readonly statsDato = computed(() => dato(this.stats()));
  protected readonly espacioDato = computed(() => dato(this.espacio()));
  protected readonly esquemaFallo = computed(() => {
    const c = this.esquema();
    return c.estado === 'fallo' ? c.mensaje : null;
  });
  protected readonly espacioFallo = computed(() => {
    const c = this.espacio();
    return c.estado === 'fallo' ? c.mensaje : null;
  });

  constructor() {
    // El índice que ya existe también cuenta algo: se dibuja de entrada.
    this.dibujarEspacio();
    pedir(this.rag.stats(), this.stats);
    pedir(this.rag.esquema(), this.esquema);
  }

  /** Tamaño legible del archivo recibido. */
  protected readonly peso = computed(() => {
    const bytes = this.store.recepcion()?.bytes ?? 0;
    return bytes > 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} kB`;
  });

  /** Páginas con y sin capa de texto. */
  protected readonly conTexto = computed(() => {
    const e = this.store.extraccion();
    return e ? e.paginas.length - e.vacias : 0;
  });

  protected readonly ultimoLote = computed(() => this.store.lotes().at(-1) ?? null);

  /** Un fragmento concreto al que seguirle la pista hasta la tabla. */
  protected readonly muestraChunk = computed(() => this.store.troceo()?.muestras[0] ?? null);

  /**
   * El documento ya estaba indexado: el SHA-256 de su contenido coincidía con
   * uno existente, así que el pipeline se detuvo antes de trocear.
   */
  protected readonly yaEstaba = computed(() => this.store.ingestaLista()?.omitido === true);

  protected readonly progresoLotes = computed(() => {
    const l = this.ultimoLote();
    return l ? Math.round((l.hechos / Math.max(1, l.total)) * 100) : 0;
  });

  /** Texto reconocido más reciente: se muestra según llega. */
  protected readonly ultimaPagina = computed(() => this.store.ocrPaginas().at(-1) ?? null);

  protected readonly confianzaBaja = computed(() => {
    const p = this.ultimaPagina();
    return p?.confianza !== null && p?.confianza !== undefined && p.confianza < 60;
  });

  // ── Entrada del archivo ───────────────────────────────────────────────────

  protected soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) this.indexar(archivo);
  }

  protected elegir(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (archivo) this.indexar(archivo);
  }

  protected sobrevolar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.arrastrando.set(dentro);
  }

  /** Lanza la indexación y deja que el backend narre lo que hace. */
  private indexar(archivo: File): void {
    this.store.reiniciarIngesta();
    this.store.indexando.set(true);
    this.espacio.set(reposo());

    this.rag.indexarNarrado(archivo).subscribe({
      next: (evento) => {
        this.store.aplicar(evento);
        if (evento.fase === 'ingesta-lista') this.dibujarEspacio();
      },
      error: (err: Error) => {
        this.store.error.set(err.message);
        this.store.indexando.set(false);
      },
      complete: () => this.store.indexando.set(false),
    });
  }

  /** Pide al backend la nube ya proyectada a 2D. */
  /** Los otros índices: los que sirven a la búsqueda literal y a los filtros. */
  protected readonly otrosIndices = computed(
    () => this.esquemaDato()?.indices.filter((i) => i.metodo !== 'hnsw') ?? [],
  );

  private dibujarEspacio(): void {
    pedir(this.rag.espacioVectorial({ muestra: 320 }), this.espacio);
  }
}
