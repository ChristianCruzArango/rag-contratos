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
import { VectorStripComponent } from '../vector-strip/vector-strip.component';
import { gsap, movimientoReducido } from '../../core/motion/motion';
import type { Etapa } from './embedding-forge.models';

/**
 * Cómo se fabrica un embedding, etapa por etapa.
 *
 * No es una caja negra: el texto entra, sale una lista de números, y en medio
 * pasan cuatro cosas concretas que explican por qué esa lista sirve para
 * comparar significados. La última —normalizar a longitud 1— es justo la que
 * hace que después baste con medir el ángulo entre dos vectores.
 */
@Component({
  selector: 'viz-embedding-forge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VectorStripComponent],
  templateUrl: './embedding-forge.component.html',
  styleUrl: './embedding-forge.component.scss',
})
export class EmbeddingForgeComponent {
  /** Texto del fragmento que se va a convertir. */
  readonly texto = input.required<string>();
  /** Tokens estimados del fragmento (el backend los calcula al trocear). */
  readonly tokens = input.required<number>();
  readonly modelo = input.required<string>();
  readonly dimensiones = input.required<number>();
  /** Muestra del vector resultante, ya medido. */
  readonly vector = input.required<number[]>();

  private readonly raiz = viewChild<ElementRef<HTMLElement>>('raiz');

  /**
   * Los modelos de la familia E5 exigen anteponer `passage:` a lo que se
   * indexa y `query:` a lo que se pregunta. Es la misma regla que aplica el
   * backend, derivada del nombre del modelo.
   */
  protected readonly usaPrefijoE5 = computed(() => /e5/i.test(this.modelo()));

  protected readonly etapas = computed<Etapa[]>(() => {
    const dims = this.dimensiones();
    return [
      {
        clave: 'prefijo',
        titulo: this.usaPrefijoE5() ? 'Se le antepone «passage:»' : 'El texto, tal cual',
        detalle: this.usaPrefijoE5()
          ? 'Los modelos E5 distinguen lo que se guarda de lo que se pregunta. Al indexar va «passage:»; a la pregunta del paso 07 le pondrá «query:». Sin ese prefijo el modelo coloca mal el texto.'
          : 'Este modelo no pide prefijo: el fragmento entra sin tocar.',
        dato: null,
      },
      {
        clave: 'tokens',
        titulo: 'Se parte en tokens',
        detalle:
          'El modelo no lee palabras, lee piezas de sub-palabra. «reajustará» puede acabar en tres. Así nunca se topa con una palabra que no conoce.',
        dato: `≈ ${this.tokens()} tokens`,
      },
      {
        clave: 'porToken',
        titulo: `Un vector por cada token`,
        detalle: `Cada pieza se convierte en su propia lista de ${dims} números, y cada una tiene en cuenta a las de alrededor: el mismo token significa cosas distintas según la frase.`,
        dato: `${this.tokens()} × ${dims}`,
      },
      {
        clave: 'pooling',
        titulo: 'Se promedian todos en uno',
        detalle: `Pooling por media: se suman los vectores de todos los tokens y se divide. De la matriz entera queda una sola lista de ${dims} números que representa el fragmento completo.`,
        dato: `→ 1 × ${dims}`,
      },
      {
        clave: 'normalizar',
        titulo: 'Se escala a longitud 1',
        detalle:
          'Se divide por su propia magnitud. Deja de importar cuánto mide el vector y sólo importa hacia dónde apunta — que es exactamente lo que después mide la distancia coseno.',
        dato: '‖v‖ = 1',
      },
    ];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const total = this.etapas().length;
      const host = this.raiz()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      // Las etapas caen en orden: es una secuencia, y leerla en desorden no
      // explicaría nada.
      const tween = gsap.fromTo(
        host.querySelectorAll('.forja__etapa'),
        { opacity: 0, x: -14 },
        {
          opacity: 1,
          x: 0,
          duration: 0.55,
          ease: 'pliego',
          stagger: 0.12,
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });
  }

  protected recorte(): string {
    const t = this.texto().replace(/\s+/g, ' ').trim();
    return t.length > 190 ? t.slice(0, 190) + '…' : t;
  }
}
