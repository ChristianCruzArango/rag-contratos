import type { EventoDe, PaginaInfo } from '../../core/pipeline/pipeline.models';

/** Una página del PDF con lo que se sabe de ella al dibujarla. */
export interface Hoja extends PaginaInfo {
  /** Densidad de texto (0–1) respecto a la página más llena del documento. */
  densidad: number;
  enCola: boolean;
  reconocida: EventoDe<'ocr-pagina'> | null;
}
