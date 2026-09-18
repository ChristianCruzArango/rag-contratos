import { WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { Carga, cargando, fallo, listo } from './carga.models';

/**
 * Vuelca una petición en un signal de `Carga<T>`, pasando por «cargando» y
 * quedándose en «listo» o en «fallo» — nunca en un silencio ambiguo.
 */
export function pedir<T>(peticion: Observable<T>, destino: WritableSignal<Carga<T>>): void {
  destino.set(cargando<T>());
  peticion.subscribe({
    next: (dato) => destino.set(listo(dato)),
    error: (err: Error) => destino.set(fallo<T>(err.message || 'No se pudo contactar con la API')),
  });
}
