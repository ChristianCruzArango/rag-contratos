import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { PipelineStore } from '../../core/pipeline/pipeline.store';
import { movimientoReducido } from '../../core/motion/motion';
import { PortadaComponent } from '../portada/portada.component';
import { ActoIngestaComponent } from '../acto-ingesta/acto-ingesta.component';
import { ActoConsultaComponent } from '../acto-consulta/acto-consulta.component';
import { ArchivoComponent } from '../archivo/archivo.component';
import type { Fase } from '../../core/pipeline/pipeline.models';

/** A qué punto del recorrido lleva cada fase del backend. */
const ANCLA: Record<Fase, string> = {
  recepcion: 'recepcion',
  extraccion: 'extraccion',
  'ocr-plan': 'ocr',
  'ocr-pagina': 'ocr',
  'ocr-resumen': 'ocr',
  troceo: 'troceo',
  'embeddings-lote': 'embeddings',
  almacenado: 'pgvector',
  'ingesta-lista': 'pgvector',
  consulta: 'pregunta',
  'consulta-embedding': 'pregunta',
  'busqueda-vectorial': 'vectorial',
  'busqueda-lexica': 'lexica',
  fusion: 'fusion',
  prompt: 'prompt',
  citas: 'respuesta',
  token: 'respuesta',
  'respuesta-lista': 'respuesta',
  error: '',
};

@Component({
  selector: 'app-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PortadaComponent, ActoIngestaComponent, ActoConsultaComponent, ArchivoComponent],
  templateUrl: './flow.page.html',
  styleUrl: './flow.page.scss',
})
export class FlowPage {
  private readonly store = inject(PipelineStore);
  private ultimaAncla: string | null = null;

  constructor() {
    // El recorrido se acompaña solo: cuando el backend pasa a un paso nuevo,
    // la página lleva al lector hasta él. Sólo al cambiar de paso, para no
    // arrastrar la vista con cada token que llega.
    effect(() => {
      const fase = this.store.faseActual();
      const trabajando = this.store.indexando() || this.store.consultando();
      if (!fase || !trabajando) return;

      const ancla = ANCLA[fase];
      if (!ancla || ancla === this.ultimaAncla) return;
      this.ultimaAncla = ancla;

      queueMicrotask(() => {
        document.getElementById(ancla)?.scrollIntoView({
          behavior: movimientoReducido() ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    });

    // Al empezar un acto nuevo se olvida dónde estaba, para poder volver.
    effect(() => {
      if (!this.store.indexando() && !this.store.consultando()) {
        this.ultimaAncla = null;
      }
    });
  }
}
