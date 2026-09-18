/** Una etapa de la fabricación de un embedding. */
export interface Etapa {
  clave: string;
  titulo: string;
  /** Qué hace, en una línea. */
  detalle: string;
  /** Dato medido que acompaña a la etapa, si lo hay. */
  dato: string | null;
}
