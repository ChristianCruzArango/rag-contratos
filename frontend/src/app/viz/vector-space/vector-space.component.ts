import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { EspacioVectorial, PuntoVectorial } from '../../core/pipeline/pipeline.models';
import { gsap, movimientoReducido } from '../../core/motion/motion';

const R = 92; // radio útil del lienzo, en unidades del viewBox

const TIPOS = [
  'arrendamiento',
  'laboral',
  'juridico',
  'confidencialidad',
  'comercial',
  'servicios',
] as const;

/**
 * El espacio vectorial de pgvector, visto de frente.
 *
 * Cada punto es un fragmento de la tabla `chunks`. Su posición sale de
 * proyectar el embedding sobre los dos ejes en los que la nube más se estira
 * (PCA sobre los vectores reales, calculado en el backend).
 *
 * El color dice de qué tipo de contrato viene. Sin eso el dibujo era una
 * mancha: mil puntos idénticos no cuentan nada. Con el color se ve lo único
 * que este mapa tiene que demostrar — que los fragmentos que hablan de lo
 * mismo caen juntos sin que nadie se lo haya dicho.
 */
@Component({
  selector: 'viz-vector-space',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './vector-space.component.html',
  styleUrl: './vector-space.component.scss',
})
export class VectorSpaceComponent {
  readonly espacio = input<EspacioVectorial | null>(null);

  protected readonly activo = signal<PuntoVectorial | null>(null);

  private readonly puntosRef = viewChild<ElementRef<SVGGElement>>('gPuntos');
  private readonly vinculosRef = viewChild<ElementRef<SVGGElement>>('gVinculos');

  protected readonly puntos = computed(() => this.espacio()?.puntos ?? []);
  protected readonly consulta = computed(() => this.espacio()?.consulta ?? null);
  protected readonly varianza = computed(() => this.espacio()?.varianza ?? [0, 0]);
  protected readonly elegidos = computed(() => this.puntos().filter((p) => p.elegido));
  protected readonly hayOcr = computed(() => this.puntos().some((p) => p.ocr));

  /** Sólo se listan los tipos que de verdad hay en el índice. */
  protected readonly tiposPresentes = computed(() => {
    const vistos = new Set(this.puntos().map((p) => this.tipo(p)));
    return [...TIPOS, 'otros'].filter((t) => vistos.has(t));
  });

  protected readonly resumen = computed(() => {
    const e = this.espacio();
    if (!e) return 'Espacio vectorial vacío';
    const base = `${e.muestra} fragmentos proyectados desde ${e.dimensiones} dimensiones a dos, coloreados por tipo de contrato`;
    return e.consulta ? `${base}; la consulta cae entre ellos` : base;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // La nube se revela, no se dispersa: un movimiento que desordena impide
    // leer justo lo que el dibujo tiene que enseñar.
    effect(() => {
      const total = this.puntos().length;
      const host = this.puntosRef()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      const tween = gsap.fromTo(
        host.children,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.45,
          ease: 'tinta',
          stagger: { each: 0.0018, from: 'start' },
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });

    effect(() => {
      const hay = this.elegidos().length;
      const host = this.vinculosRef()?.nativeElement;
      if (!host || !hay || movimientoReducido()) return;

      const tween = gsap.fromTo(
        host.children,
        { drawSVG: '0%', opacity: 0 },
        {
          drawSVG: '100%',
          opacity: 1,
          duration: 0.7,
          ease: 'tinta',
          stagger: 0.06,
          delay: 0.3,
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });
  }

  protected tipo(p: PuntoVectorial): string {
    const t = (p.tipo ?? '').toLowerCase();
    return (TIPOS as readonly string[]).includes(t) ? t : 'otros';
  }

  /** Los elegidos mandan; sin consulta, todos valen lo mismo. */
  protected radio(p: PuntoVectorial): number {
    if (p.elegido) return 5;
    if (p.fuera) return 1.9;
    return p.similitud === null ? 2.6 : 2.2;
  }

  protected opacidad(p: PuntoVectorial): number {
    if (p.elegido) return 1;
    // Con consulta, lo no elegido se aparta para que ganen los que importan.
    return this.consulta() ? 0.3 : 0.62;
  }

  protected etiquetaPunto(p: PuntoVectorial): string {
    const partes = [p.titulo, p.seccion ?? 'preámbulo'];
    if (p.pagina) partes.push(`pág. ${p.pagina}`);
    if (p.similitud !== null) partes.push(`coseno ${p.similitud.toFixed(3)}`);
    if (p.ocr) partes.push('texto de OCR');
    return partes.join(' · ');
  }

  protected pct(v: number): string {
    return `${(v * 100).toFixed(1)} %`;
  }
}

export { R };
