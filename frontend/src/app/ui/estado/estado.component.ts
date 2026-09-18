import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Qué está pasando con algo que se esperaba. */
export type Signo = 'reposo' | 'trabajando' | 'listo' | 'fallo';

/**
 * Una línea que dice en qué punto está algo.
 *
 * Su único trabajo es que nunca haya duda entre «esto sigue trabajando» y
 * «esto terminó» o «esto se rompió». Antes las tres cosas se veían igual.
 */
@Component({
  selector: 'app-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estado.component.html',
  styleUrl: './estado.component.scss',
})
export class EstadoComponent {
  readonly signo = input.required<Signo>();
  /** Qué se está esperando, en una línea. */
  readonly mensaje = input.required<string>();
  /** Detalle opcional: el error, o el tiempo que tardó. */
  readonly detalle = input<string | null>(null);
}
