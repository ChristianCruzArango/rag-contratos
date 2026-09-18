/**
 * El estado de algo que se pide al servidor.
 *
 * Existe porque guardar el resultado en `T | null` hace indistinguibles tres
 * situaciones muy distintas: que no se haya pedido todavía, que se esté
 * pidiendo, y que haya fallado. Las tres se pintaban igual —un «esperando…»
 * inmóvil— y ante un backend caído la página parecía colgada en lugar de rota.
 */
export type Carga<T> =
  | { estado: 'reposo' }
  | { estado: 'cargando' }
  | { estado: 'listo'; dato: T }
  | { estado: 'fallo'; mensaje: string };

export const reposo = <T>(): Carga<T> => ({ estado: 'reposo' });
export const cargando = <T>(): Carga<T> => ({ estado: 'cargando' });
export const listo = <T>(dato: T): Carga<T> => ({ estado: 'listo', dato });
export const fallo = <T>(mensaje: string): Carga<T> => ({ estado: 'fallo', mensaje });

/** El dato si ya llegó; null en cualquier otro caso. */
export function dato<T>(c: Carga<T>): T | null {
  return c.estado === 'listo' ? c.dato : null;
}
