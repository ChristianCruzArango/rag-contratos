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
import type { EventoDe, PaginaInfo } from '../../core/pipeline/pipeline.models';
import { gsap, movimientoReducido } from '../../core/motion/motion';
import type { Hoja } from './page-grid.models';

/**
 * Las páginas del PDF, una a una.
 *
 * Cada hoja dibuja tantas rayas como texto se le pudo sacar. Una hoja en ámbar
 * y vacía es una página que el programa no sabe leer: existe, se ve en un
 * visor, pero para el índice está en blanco. Ahí es donde entra el OCR, y se ve
 * cómo se rellena.
 */
@Component({
  selector: 'viz-page-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-grid.component.html',
  styleUrl: './page-grid.component.scss',
})
export class PageGridComponent {
  readonly paginas = input.required<PaginaInfo[]>();
  /** Páginas que el OCR va a procesar. */
  readonly objetivo = input<number[]>([]);
  /** Páginas ya reconocidas, con su confianza real. */
  readonly reconocidas = input<EventoDe<'ocr-pagina'>[]>([]);
  /** Cuántas hojas se dibujan como máximo. */
  readonly tope = input(96);

  private readonly rejilla = viewChild<ElementRef<HTMLElement>>('rejilla');

  protected readonly hojas = computed<Hoja[]>(() => {
    const paginas = this.paginas();
    const techo = Math.max(1, ...paginas.map((p) => p.caracteres));
    const enCola = new Set(this.objetivo());
    const hechas = new Map(this.reconocidas().map((r) => [r.pagina, r]));

    return paginas.slice(0, this.tope()).map((p) => ({
      ...p,
      densidad: p.caracteres / techo,
      enCola: enCola.has(p.n),
      reconocida: hechas.get(p.n) ?? null,
    }));
  });

  protected readonly restantes = computed(() => Math.max(0, this.paginas().length - this.tope()));

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Las hojas caen escalonadas la primera vez que hay páginas.
    effect(() => {
      const total = this.hojas().length;
      const host = this.rejilla()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      const tween = gsap.fromTo(
        host.querySelectorAll('.hoja'),
        { opacity: 0, y: 14, rotateX: -22 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          duration: 0.5,
          ease: 'pliego',
          stagger: { each: 0.012, from: 'start' },
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });

    // Cada página reconocida da un golpe de luz al llegar su resultado.
    effect(() => {
      const ultima = this.reconocidas().at(-1);
      const host = this.rejilla()?.nativeElement;
      if (!ultima || !host || movimientoReducido()) return;

      const hoja = host.querySelector(`[data-pagina="${ultima.pagina}"]`);
      if (!hoja) return;
      gsap.fromTo(
        hoja,
        { scale: 1 },
        { scale: 1.16, duration: 0.24, ease: 'sello', yoyo: true, repeat: 1 },
      );
    });
  }

  /** Rayas de texto: más caracteres, más líneas y más largas. */
  protected rayas(hoja: Hoja): number[] {
    const texto = hoja.reconocida ? Math.min(1, hoja.reconocida.caracteres / 2600) : hoja.densidad;
    const n = Math.round(texto * 9);
    // Longitudes desiguales para que parezca un párrafo, no una barra.
    return Array.from({ length: n }, (_, i) =>
      i === n - 1 ? 42 + ((i * 37) % 38) : 72 + ((i * 53) % 26),
    );
  }

  protected titulo(hoja: Hoja): string {
    if (hoja.reconocida) {
      const c = hoja.reconocida.confianza;
      return `Página ${hoja.n} · reconocida por OCR · ${hoja.reconocida.caracteres} caracteres${
        c === null ? '' : ` · confianza ${c.toFixed(1)}%`
      }`;
    }
    if (hoja.vacia) return `Página ${hoja.n} · sin capa de texto`;
    return `Página ${hoja.n} · ${hoja.caracteres} caracteres extraídos`;
  }
}
