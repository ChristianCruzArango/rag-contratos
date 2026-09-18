import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PipelineStore } from '../../core/pipeline/pipeline.store';
import { EstadoComponent, type Signo } from '../estado/estado.component';

/**
 * Lo que se enseña en un paso que todavía no tiene datos.
 *
 * Hay tres motivos distintos para que un paso esté vacío y antes se veían
 * todos igual, con un «Esperando…» inmóvil:
 *
 *   1. El recorrido no ha empezado.
 *   2. Está en marcha y a este paso aún no le ha llegado el turno.
 *   3. **Terminó y este paso no llegó a ocurrir.**
 *
 * El tercero es el que engañaba: el margen decía «Respuesta lista» mientras un
 * paso seguía diciendo «Esperando a la fusión…». Pasa de verdad — si la
 * búsqueda no encuentra nada, el backend no llega a armar el prompt.
 */
@Component({
  selector: 'app-paso-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoComponent],
  template: `<app-estado [signo]="signo()" [mensaje]="mensaje()" />`,
  styles: [':host { display: block; }'],
})
export class PasoEstadoComponent {
  /** Qué hacer para que este paso ocurra. */
  readonly inactivo = input.required<string>();
  /** Qué se está esperando mientras el recorrido avanza. */
  readonly esperando = input.required<string>();
  /** Por qué este paso pudo no llegar a ocurrir. */
  readonly omitido = input<string>('El recorrido terminó sin pasar por aquí.');
  /** El acto al que pertenece el paso. */
  readonly acto = input<'ingesta' | 'consulta'>('consulta');

  private readonly store = inject(PipelineStore);

  private readonly enMarcha = computed(() =>
    this.acto() === 'ingesta' ? this.store.indexando() : this.store.consultando(),
  );

  private readonly acabo = computed(() =>
    this.acto() === 'ingesta'
      ? this.store.ingestaLista() !== null
      : this.store.respuestaLista() !== null,
  );

  protected readonly signo = computed<Signo>(() => {
    if (this.enMarcha()) return 'trabajando';
    if (this.store.error()) return 'fallo';
    return 'reposo';
  });

  protected readonly mensaje = computed(() => {
    if (this.enMarcha()) return this.esperando();
    if (this.store.error()) return 'El recorrido se interrumpió antes de llegar aquí.';
    if (this.acabo()) return this.omitido();
    return this.inactivo();
  });
}
