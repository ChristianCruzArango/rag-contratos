import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { gsap, movimientoReducido } from '../../core/motion/motion';
import type { Barra } from './vector-strip.models';

/**
 * Un embedding hecho visible.
 *
 * Es el elemento firma de la pieza. Cada barra es **una dimensión** del vector
 * y su altura es el valor que devolvió el modelo: hacia arriba si es positivo,
 * hacia abajo si es negativo, medido siempre desde la misma línea del cero.
 *
 * Se dibuja como barras y no como un degradado de colores porque un embedding
 * es una lista de números con signo, y eso se lee de un vistazo en un eje y no
 * en una escala de tonos: con colores, la tira parece un código de barras.
 */
@Component({
  selector: 'viz-vector-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vector-strip.component.html',
  styleUrl: './vector-strip.component.scss',
})
export class VectorStripComponent {
  /** Muestra de dimensiones del embedding tal como llegó del backend. */
  readonly valores = input.required<number[]>();
  /** Qué vector es éste. */
  readonly etiqueta = input('embedding');

  private readonly caja = viewChild<ElementRef<HTMLElement>>('caja');

  protected readonly barras = computed<Barra[]>(() => {
    const v = this.valores();
    if (!v.length) return [];
    const techo = Math.max(...v.map(Math.abs)) || 1;
    return v.map((x) => {
      const n = x / techo;
      return {
        v: x,
        // Suelo del 6 %: un valor casi cero debe seguir viéndose como un valor
        // pequeño, no como un hueco.
        alto: 6 + Math.abs(n) * 94,
        positivo: n >= 0,
      };
    });
  });

  protected readonly descripcion = computed(() => {
    const n = this.valores().length;
    return `${this.etiqueta()}: ${n} dimensiones, cada barra un número con signo`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const barras = this.barras();
      const host = this.caja()?.nativeElement;
      if (!host || !barras.length || movimientoReducido()) return;

      const filas = host.querySelectorAll('.vector__barras > i');
      // Las dimensiones brotan de la línea del cero, de izquierda a derecha:
      // el vector se escribe, no aparece.
      const tween = gsap.fromTo(
        filas,
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.5,
          ease: 'pliego',
          stagger: { each: 0.005, from: 'start' },
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });
  }
}
