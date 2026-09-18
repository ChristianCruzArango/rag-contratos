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
import type { EspacioVectorial } from '../../core/pipeline/pipeline.models';
import type { EsquemaTabla, RagStats } from '../../core/rag/rag.models';

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
  ],
  templateUrl: './acto-ingesta.component.html',
  styleUrl: '../acto.scss',
})
export class ActoIngestaComponent {
  protected readonly store = inject(PipelineStore);
  protected readonly stats = signal<RagStats | null>(null);
  /** El esquema de `chunks` tal como lo describe Postgres ahora mismo. */
  protected readonly esquema = signal<EsquemaTabla | null>(null);
  protected readonly arrastrando = signal(false);
  protected readonly espacio = signal<EspacioVectorial | null>(null);

  private readonly rag = inject(RagService);

  /** Dimensión del vector: la del índice, o la del último lote indexado. */
  protected readonly dimensiones = computed(
    () => this.ultimoLote()?.dimensiones ?? this.stats()?.dimensiones ?? 0,
  );

  constructor() {
    // El índice que ya existe también cuenta algo: se dibuja de entrada.
    this.dibujarEspacio();
    this.rag.stats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(null),
    });
    this.rag.esquema().subscribe({
      next: (e) => this.esquema.set(e),
      error: () => this.esquema.set(null),
    });
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
    this.espacio.set(null);

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
    () => this.esquema()?.indices.filter((i) => i.metodo !== 'hnsw') ?? [],
  );

  private dibujarEspacio(): void {
    this.rag.espacioVectorial({ muestra: 320 }).subscribe({
      next: (e) => this.espacio.set(e),
      error: () => this.espacio.set(null),
    });
  }
}
