/** Un trozo de la respuesta: texto corrido o un marcador de cita. */
export interface Trozo {
  texto: string;
  /** Número de la cita si el trozo es un marcador `[n]`; null si es texto. */
  cita: number | null;
}
