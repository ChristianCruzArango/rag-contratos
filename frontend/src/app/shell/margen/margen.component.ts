import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  afterNextRender,
} from '@angular/core';
import { PipelineStore } from '../../core/pipeline/pipeline.store';
import { TemaService } from '../../core/tema/tema.service';
import { EstadoComponent } from '../../ui/estado/estado.component';
import { PASOS } from './pasos';

/**
 * El margen numerado: la columna vertebral de la página.
 *
 * Un contrato numera sus cláusulas en el margen para que cualquiera pueda
 * señalar un punto exacto del texto. Aquí hace lo mismo con el recorrido del
 * documento: dice en qué paso va, cuáles ya ocurrieron —con datos reales del
 * backend, no con una barra de progreso inventada— y permite saltar a
 * cualquiera de ellos.
 */
@Component({
  selector: 'app-margen',
  imports: [EstadoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './margen.component.html',
  styleUrl: './margen.component.scss',
})
export class MargenComponent {
  protected readonly pasos = PASOS;
  protected readonly visible = signal<string | null>(null);

  protected readonly tema = inject(TemaService);
  protected readonly store = inject(PipelineStore);

  /** Fases que el backend ya confirmó. */
  protected readonly hechos = computed(() => {
    const s = this.store;
    const hechas = new Set<string>();
    if (s.recepcion()) hechas.add('recepcion');
    if (s.extraccion()) hechas.add('extraccion');
    if (s.ocrPlan()) hechas.add('ocr-plan');
    if (s.troceo()) hechas.add('troceo');
    if (s.lotes().length) hechas.add('embeddings-lote');
    if (s.almacenado()) hechas.add('almacenado');
    if (s.consultaEmbedding()) hechas.add('consulta-embedding');
    if (s.vectorial()) hechas.add('busqueda-vectorial');
    if (s.lexica()) hechas.add('busqueda-lexica');
    if (s.fusion()) hechas.add('fusion');
    if (s.prompt()) hechas.add('prompt');
    if (s.respuestaLista()) hechas.add('respuesta-lista');
    return hechas;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const secciones = document.querySelectorAll('[data-paso]');
      if (!secciones.length) return;

      const observador = new IntersectionObserver(
        (entradas) => {
          const dentro = entradas
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (dentro) {
            this.visible.set((dentro.target as HTMLElement).dataset['paso'] ?? null);
          }
        },
        { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.25, 0.6] },
      );

      secciones.forEach((s) => observador.observe(s));
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }

  protected numero(i: number): string {
    return String(i + 1).padStart(2, '0');
  }
}
