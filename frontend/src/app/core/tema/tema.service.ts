import { Injectable, effect, signal } from '@angular/core';
import type { Tema } from './tema.models';

const CLAVE = 'recorrido-tema';

/**
 * El tema de la página.
 *
 * Arranca en claro: el recorrido es sobre todo texto que hay que leer con
 * calma, y sobre papel claro se lee mejor durante más rato. El oscuro sigue
 * ahí a un clic, y la elección se recuerda.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly tema = signal<Tema>(leerGuardado());

  constructor() {
    effect(() => {
      const tema = this.tema();
      document.documentElement.dataset['tema'] = tema;
      try {
        localStorage.setItem(CLAVE, tema);
      } catch {
        /* modo privado o almacenamiento bloqueado: da igual, se pierde */
      }
    });
  }

  alternar(): void {
    this.tema.update((t) => (t === 'claro' ? 'oscuro' : 'claro'));
  }
}

function leerGuardado(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    /* sin almacenamiento */
  }
  return 'claro';
}
