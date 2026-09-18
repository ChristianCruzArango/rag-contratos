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
import type { FilaFusion, HitRecuperado } from '../../core/pipeline/pipeline.models';
import { gsap, movimientoReducido } from '../../core/motion/motion';

/**
 * Reciprocal Rank Fusion: cómo se juntan los dos buscadores.
 *
 * Cada buscador entrega su propia lista ordenada. RRF no compara sus
 * puntuaciones —no son comparables: una es un coseno y la otra un ts_rank— sino
 * los **puestos**: cada lista aporta 1/(k + puesto), con k = 60. Un fragmento
 * que sale bien colocado en las dos listas suma dos veces y se va arriba.
 *
 * La barra de cada fila es esa suma, partida por origen: el trozo violeta es lo
 * que aportó la búsqueda por significado, el verde lo que aportó la literal.
 */
@Component({
  selector: 'viz-rrf-fusion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rrf-fusion.component.html',
  styleUrl: './rrf-fusion.component.scss',
})
export class RrfFusionComponent {
  readonly vectorial = input<HitRecuperado[]>([]);
  readonly lexica = input<HitRecuperado[]>([]);
  readonly filas = input<FilaFusion[]>([]);
  readonly k = input(60);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  protected readonly elegidos = computed(() => this.filas().filter((f) => f.elegido).length);

  protected readonly mejor = computed(() => Math.max(0.0001, ...this.filas().map((f) => f.score)));

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Cada fila entra por el lado del buscador que la propuso; las que vienen
    // de los dos convergen desde el centro.
    effect(() => {
      const total = this.filas().length;
      const host = this.lista()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      const tween = gsap.fromTo(
        host.children,
        {
          opacity: 0,
          x: (i: number, el: Element) => {
            const origen = (el as HTMLElement).dataset['origen'];
            if (origen === 'semantico') return -48;
            if (origen === 'lexico') return 48;
            return 0;
          },
          scaleX: (i: number, el: Element) =>
            (el as HTMLElement).dataset['origen'] === 'ambos' ? 0.88 : 1,
        },
        {
          opacity: 1,
          x: 0,
          scaleX: 1,
          duration: 0.8,
          ease: 'tinta',
          stagger: 0.045,
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });
  }

  protected origen(f: FilaFusion): 'semantico' | 'lexico' | 'ambos' {
    if (f.rank_semantico && f.rank_lexico) return 'ambos';
    return f.rank_semantico ? 'semantico' : 'lexico';
  }

  protected ancho(f: FilaFusion): number {
    return Math.max(6, (f.score / this.mejor()) * 100);
  }

  /** Reparto de la barra entre los dos buscadores, en porcentaje. */
  protected reparto(f: FilaFusion): { sem: number; lit: number } {
    const total = f.aporte_semantico + f.aporte_lexico || 1;
    return {
      sem: (f.aporte_semantico / total) * 100,
      lit: (f.aporte_lexico / total) * 100,
    };
  }

  /** La cuenta, escrita tal cual se hace. */
  protected formula(f: FilaFusion): string {
    const partes: string[] = [];
    if (f.rank_semantico) partes.push(`1/(${this.k()}+${f.rank_semantico})`);
    if (f.rank_lexico) partes.push(`1/(${this.k()}+${f.rank_lexico})`);
    return partes.join(' + ');
  }
}
