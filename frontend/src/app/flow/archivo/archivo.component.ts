import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RagService } from '../../core/rag/rag.service';
import type { DocumentRow, IngestResult } from '../../core/rag/rag.models';

/**
 * El archivo: qué hay indexado ahora mismo.
 *
 * Es una lista, no una rejilla de tarjetas. Un archivo jurídico se consulta en
 * columnas —expediente, tipo, folios, fecha— y esa forma dice más sobre el
 * contenido que cualquier caja con sombra.
 */
@Component({
  selector: 'app-archivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './archivo.component.html',
  styleUrl: './archivo.component.scss',
})
export class ArchivoComponent {
  protected readonly documentos = signal<DocumentRow[]>([]);
  protected readonly sembrando = signal(false);
  protected readonly aviso = signal<string | null>(null);

  private readonly rag = inject(RagService);

  constructor() {
    this.recargar();
  }

  protected sembrar(): void {
    this.sembrando.set(true);
    // Sin cifras: cuántos contratos hay en seed-data y cuántos fragmentos
    // saldrán sólo se sabe cuando el backend termina. Inventar un número aquí
    // sería lo mismo que no medir nada.
    this.aviso.set('Indexando la carpeta seed-data. Puede tardar varios minutos.');
    this.rag.seed().subscribe({
      next: (resultados) => {
        this.aviso.set(this.resumenSiembra(resultados));
        this.recargar();
      },
      error: (err: Error) => this.aviso.set(`No se pudo indexar: ${err.message}`),
      complete: () => this.sembrando.set(false),
    });
  }

  protected borrar(doc: DocumentRow): void {
    this.rag.deleteDocument(doc.id).subscribe({
      next: () => {
        this.documentos.update((ds) => ds.filter((d) => d.id !== doc.id));
        this.aviso.set(`«${doc.title}» salió del índice.`);
      },
      error: (err: Error) => this.aviso.set(`No se pudo borrar: ${err.message}`),
    });
  }

  /** Lo que de verdad indexó el backend, contado sobre su respuesta. */
  private resumenSiembra(resultados: IngestResult[]): string {
    const nuevos = resultados.filter((r) => !r.skipped);
    const omitidos = resultados.length - nuevos.length;
    const fragmentos = nuevos.reduce((total, r) => total + r.chunks, 0);

    if (!nuevos.length) {
      return `Nada nuevo: los ${resultados.length} documentos ya estaban indexados.`;
    }
    const base = `${nuevos.length} documentos y ${fragmentos.toLocaleString('es')} fragmentos indexados.`;
    return omitidos ? `${base} Otros ${omitidos} ya estaban.` : base;
  }

  private recargar(): void {
    this.rag.documents().subscribe({
      next: (ds) => this.documentos.set(ds),
      error: () => this.documentos.set([]),
    });
  }
}
