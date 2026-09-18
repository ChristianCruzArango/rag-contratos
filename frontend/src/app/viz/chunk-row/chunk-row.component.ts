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
import type { ChunkMuestra } from '../../core/pipeline/pipeline.models';
import type { Columna } from './chunk-row.models';

/**
 * Una fila de `chunks`, columna a columna.
 *
 * Es el momento en que el fragmento deja de ser un objeto en memoria y pasa a
 * ser una fila. Interesa por dos cosas que no se ven en el DDL: qué valor
 * concreto acaba en cada columna, y que **dos de ellas no las escribe el
 * backend** — el id y el `tsvector` los genera Postgres solo.
 */
@Component({
  selector: 'viz-chunk-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VectorStripComponent],
  templateUrl: './chunk-row.component.html',
  styleUrl: './chunk-row.component.scss',
})
export class ChunkRowComponent {
  readonly muestra = input.required<ChunkMuestra>();
  readonly vector = input.required<number[]>();
  readonly documentId = input.required<string>();
  readonly dimensiones = input.required<number>();

  private readonly raiz = viewChild<ElementRef<HTMLElement>>('raiz');

  protected readonly columnas = computed<Columna[]>(() => {
    const m = this.muestra();
    return [
      {
        nombre: 'id',
        tipo: 'uuid',
        valor: 'gen_random_uuid()',
        generada: true,
        esVector: false,
      },
      {
        nombre: 'document_id',
        tipo: 'uuid',
        valor: this.documentId(),
        generada: false,
        esVector: false,
      },
      {
        nombre: 'chunk_index',
        tipo: 'integer',
        valor: String(m.index),
        generada: false,
        esVector: false,
      },
      {
        nombre: 'content',
        tipo: 'text',
        valor: recorte(m.texto, 150),
        generada: false,
        esVector: false,
      },
      {
        nombre: 'token_count',
        tipo: 'integer',
        valor: String(m.tokens),
        generada: false,
        esVector: false,
      },
      {
        nombre: 'metadata',
        tipo: 'jsonb',
        valor: JSON.stringify(
          {
            seccion: m.seccion,
            tipo_seccion: m.tipo_seccion,
            pagina: m.pagina,
            ocr: m.ocr,
          },
          null,
          0,
        ),
        generada: false,
        esVector: false,
      },
      {
        nombre: 'embedding',
        tipo: `vector(${this.dimensiones()})`,
        valor: literal(this.vector()),
        generada: false,
        esVector: true,
      },
      {
        nombre: 'tsv',
        tipo: 'tsvector',
        valor: "to_tsvector('es_unaccent', content)",
        generada: true,
        esVector: false,
      },
    ];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const total = this.columnas().length;
      const host = this.raiz()?.nativeElement;
      if (!host || !total || movimientoReducido()) return;

      // Las columnas se rellenan de arriba abajo, como se escribe una fila.
      const tween = gsap.fromTo(
        host.querySelectorAll('.fila__columna'),
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'pliego',
          stagger: 0.07,
          overwrite: 'auto',
        },
      );
      destroyRef.onDestroy(() => tween.kill());
    });
  }
}

function recorte(texto: string, n: number): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** El formato que pgvector espera como literal de texto. */
function literal(v: number[]): string {
  if (!v.length) return '[]';
  const cabeza = v
    .slice(0, 4)
    .map((x) => x.toFixed(4))
    .join(',');
  return `[${cabeza},…]`;
}
