import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { EstadoComponent } from '../../ui/estado/estado.component';
import { RagService } from '../../core/rag/rag.service';
import type { RagStats } from '../../core/rag/rag.models';
import { pedir } from '../../core/carga/carga';
import { type Carga, dato, reposo } from '../../core/carga/carga.models';

/**
 * La portada: qué es esta página y qué hay indexado ahora mismo.
 *
 * Las cifras salen de `/api/rag/stats`, no de una maqueta: si el índice está
 * vacío, la portada lo dice.
 */
@Component({
  selector: 'app-portada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, EstadoComponent],
  templateUrl: './portada.component.html',
  styleUrl: './portada.component.scss',
})
export class PortadaComponent {
  protected readonly stats = signal<Carga<RagStats>>(reposo());
  protected readonly statsDato = computed(() => dato(this.stats()));
  protected readonly statsFallo = computed(() => {
    const c = this.stats();
    return c.estado === 'fallo' ? c.mensaje : null;
  });

  private readonly rag = inject(RagService);

  constructor() {
    pedir(this.rag.stats(), this.stats);
  }
}
