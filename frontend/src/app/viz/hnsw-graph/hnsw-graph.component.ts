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
import type { IndiceHnsw } from '../../core/rag/rag.models';
import type { Capa } from './hnsw-graph.models';

/** Cuántos nodos se dibujan como mucho en la capa de abajo. */
const NODOS_DIBUJADOS = 15;

/**
 * El índice HNSW.
 *
 * El grafo interno no se puede leer desde SQL —pgvector no lo expone—, así que
 * las **posiciones** de los nodos son un dibujo. Pero la **estructura** sí sale
 * de datos reales: cuántas capas hay y cuántos nodos tiene cada una se derivan
 * de las filas indexadas y de la `m` del índice, que es precisamente la regla
 * con la que HNSW se construye — cada capa tiene del orden de `m` veces menos
 * nodos que la de abajo.
 *
 * Por eso el dibujo cambia cuando cambia el índice: con la tabla vacía no hay
 * capas que enseñar, y a medida que crece van apareciendo.
 */
@Component({
  selector: 'viz-hnsw-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hnsw-graph.component.html',
  styleUrl: './hnsw-graph.component.scss',
})
export class HnswGraphComponent {
  /** Parámetros medidos del índice. Sin ellos no hay nada que derivar. */
  readonly indice = input<IndiceHnsw | null>(null);

  private readonly grafo = viewChild<ElementRef<HTMLElement>>('grafo');

  /**
   * Número de capas que HNSW necesita para estas filas.
   * Con `m` vecinos por nodo, cada capa divide entre `m`: log_m(filas).
   */
  protected readonly capas = computed<Capa[]>(() => {
    const idx = this.indice();
    if (!idx || idx.filas < 1) return [];

    const niveles = Math.max(1, Math.ceil(Math.log(idx.filas) / Math.log(idx.m)));
    const alto = 150;
    const paso = alto / Math.max(1, niveles);

    return Array.from({ length: niveles }, (_, i) => {
      const nivel = niveles - 1 - i; // se dibuja de arriba (más ralo) abajo
      const nodosReales = Math.max(1, Math.round(idx.filas / idx.m ** nivel));
      const dibujados = Math.max(2, Math.min(NODOS_DIBUJADOS, nodosReales));
      const ancho = 300;
      const margen = 14;
      const util = ancho - margen * 2;

      return {
        nivel,
        y: 18 + i * paso,
        nodosReales,
        nodos: Array.from({ length: dibujados }, (_, k) => ({
          x: margen + (dibujados === 1 ? util / 2 : (util / (dibujados - 1)) * k),
          id: `n${nivel}-${k}`,
        })),
        // El descenso entra por el primer tercio y avanza hacia el centro.
        ruta: [
          `n${nivel}-${Math.floor(dibujados * 0.25)}`,
          `n${nivel}-${Math.floor(dibujados * 0.55)}`,
        ],
      };
    });
  });

  /** El camino que recorre la búsqueda: un salto por capa, de arriba abajo. */
  protected readonly descenso = computed(() => {
    const capas = this.capas();
    if (!capas.length) return '';
    const puntos: string[] = [];
    for (const capa of capas) {
      for (const id of capa.ruta) {
        const nodo = capa.nodos.find((n) => n.id === id);
        if (nodo) puntos.push(`${nodo.x} ${capa.y}`);
      }
    }
    return 'M ' + puntos.join(' L ');
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const hay = this.capas().length;
      const host = this.grafo()?.nativeElement;
      if (!host || !hay || movimientoReducido()) return;

      const linea = host.querySelector('.descenso');
      if (!linea) return;

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.8 });
      tl.fromTo(linea, { drawSVG: '0%' }, { drawSVG: '100%', duration: 2.2, ease: 'tinta' }).to(
        linea,
        { drawSVG: '100% 100%', duration: 0.7, ease: 'tinta' },
        '+=1.2',
      );

      destroyRef.onDestroy(() => tl.kill());
    });
  }

  /** Cada nodo se enlaza con su vecino: arcos suaves, no líneas rectas. */
  protected aristas(capa: Capa): { d: string }[] {
    return capa.nodos.slice(0, -1).map((n, i) => {
      const siguiente = capa.nodos[i + 1];
      const medio = (n.x + siguiente.x) / 2;
      return {
        d: `M ${n.x} ${capa.y} Q ${medio} ${capa.y - 9} ${siguiente.x} ${capa.y}`,
      };
    });
  }

  protected miles(n: number): string {
    return n.toLocaleString('es');
  }
}
