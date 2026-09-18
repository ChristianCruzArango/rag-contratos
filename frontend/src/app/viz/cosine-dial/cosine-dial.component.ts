import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * La distancia coseno, que es como pgvector decide qué se parece a qué.
 *
 * Dos textos se comparan por el ángulo entre sus vectores, no por lo lejos que
 * estén del origen. Ángulo pequeño = hablan de lo mismo, aunque uno sea largo y
 * el otro corto. Por eso "¿cuánto sube el arriendo?" encuentra una cláusula que
 * dice "reajuste anual del canon" sin compartir una sola palabra.
 */
@Component({
  selector: 'viz-cosine-dial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cosine-dial.component.html',
  styleUrl: './cosine-dial.component.scss',
})
export class CosineDialComponent {
  /** Similitud coseno real, entre 0 y 1. */
  readonly similitud = input.required<number>();

  protected readonly grados = computed(() => {
    const s = Math.max(-1, Math.min(1, this.similitud()));
    return (Math.acos(s) * 180) / Math.PI;
  });

  protected readonly arco = computed(() => {
    const rad = (this.grados() * Math.PI) / 180;
    const r = 40;
    const x = 14 + Math.cos(rad) * r;
    const y = 94 - Math.sin(rad) * r;
    return `M ${14 + r} 94 A ${r} ${r} 0 0 0 ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  protected readonly descripcion = computed(
    () =>
      `Ángulo de ${this.grados().toFixed(1)} grados entre la consulta y el fragmento; coseno ${this.similitud().toFixed(3)}`,
  );
}
