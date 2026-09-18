import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RagService } from '../../core/rag/rag.service';
import type { RagStats } from '../../core/rag/rag.models';

/**
 * La portada: qué es esta página y qué hay indexado ahora mismo.
 *
 * Las cifras salen de `/api/rag/stats`, no de una maqueta: si el índice está
 * vacío, la portada lo dice.
 */
@Component({
  selector: 'app-portada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './portada.component.html',
  styleUrl: './portada.component.scss',
})
export class PortadaComponent {
  protected readonly stats = signal<RagStats | null>(null);

  private readonly rag = inject(RagService);

  constructor() {
    this.rag.stats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(null),
    });
  }
}
