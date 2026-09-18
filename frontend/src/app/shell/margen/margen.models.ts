import type { Fase } from '../../core/pipeline/pipeline.models';

/** Un paso del recorrido, tal como lo lista el margen numerado. */
export interface Paso {
  /** Ancla de la sección correspondiente en la página. */
  id: string;
  titulo: string;
  acto: 'ingesta' | 'consulta';
  /** Fase del backend que da por cumplido este paso. */
  cumple: Fase;
}
