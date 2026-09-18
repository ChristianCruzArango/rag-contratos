import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RevealDirective } from '../../core/motion/reveal.directive';

/**
 * Una banda del recorrido.
 *
 * No es una tarjeta: no hay caja, ni sombra, ni fondo propio. Lo único que
 * separa un paso del siguiente es un hilo de luz y mucho aire, igual que en un
 * documento impreso. El número y el título quedan fijos a la izquierda mientras
 * el contenido se desplaza: así nunca se pierde de vista en qué paso se está.
 */
@Component({
  selector: 'app-paso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  templateUrl: './paso.component.html',
  styleUrl: './paso.component.scss',
})
export class PasoComponent {
  readonly ancla = input.required<string>();
  readonly numero = input.required<string>();
  readonly titulo = input.required<string>();
}
