import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { contarHasta, movimientoReducido } from '../../core/motion/motion';

/**
 * Una cifra medida, contando hasta su valor.
 *
 * Siempre en la voz de la máquina (mono, cifras tabulares) para que se
 * distinga de la voz editorial del texto. El número que llega es el que midió
 * el backend; la animación sólo lo trae hasta ahí.
 */
@Component({
  selector: 'app-cifra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cifra.component.html',
  styleUrl: './cifra.component.scss',
})
export class CifraComponent {
  readonly valor = input.required<number>();
  readonly rotulo = input.required<string>();
  readonly sufijo = input('');
  readonly decimales = input(0);

  protected readonly mostrado = signal('0');

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const destino = this.valor();
      const dec = this.decimales();
      const formatear = (v: number) =>
        v.toLocaleString('es', {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        });

      if (movimientoReducido()) {
        this.mostrado.set(formatear(destino));
        return;
      }

      const tween = contarHasta({ valor: 0 }, destino, (v) => this.mostrado.set(formatear(v)));
      destroyRef.onDestroy(() => tween.kill());
    });
  }
}
