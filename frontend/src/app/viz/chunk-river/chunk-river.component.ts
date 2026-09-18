import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { ChunkMuestra } from '../../core/pipeline/pipeline.models';
import { gsap, movimientoReducido } from '../../core/motion/motion';

/**
 * El texto convertido en fragmentos.
 *
 * El corte no es cada 1.200 caracteres a ciegas: primero se parte por cláusula
 * o anexo, y sólo dentro de una cláusula demasiado larga se corta por párrafo.
 * Así un fragmento nunca mezcla dos cláusulas, y puede citar su número y su
 * página. En cada costura se repiten los últimos caracteres del fragmento
 * anterior: ese solape evita que una idea quede partida justo por la mitad.
 */
@Component({
  selector: 'viz-chunk-river',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chunk-river.component.html',
  styleUrl: './chunk-river.component.scss',
})
export class ChunkRiverComponent {
  readonly muestras = input.required<ChunkMuestra[]>();
  readonly overlap = input(200);

  private readonly rio = viewChild<ElementRef<HTMLElement>>('rio');

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const total = this.muestras().length;
      const host = this.rio()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      const tl = gsap.timeline();
      tl.fromTo(
        host.querySelectorAll('.pieza'),
        { opacity: 0, y: 26, filter: 'blur(6px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.7,
          ease: 'pliego',
          stagger: 0.09,
        },
      ).fromTo(
        host.querySelectorAll('.costura'),
        { scaleX: 0, opacity: 0 },
        {
          scaleX: 1,
          opacity: 1,
          duration: 0.5,
          ease: 'tinta',
          stagger: 0.09,
          transformOrigin: 'left center',
        },
        0.2,
      );

      destroyRef.onDestroy(() => tl.kill());
    });
  }

  protected pad(n: number): string {
    return String(n).padStart(3, '0');
  }
}
