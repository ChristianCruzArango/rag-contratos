import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { DocumentRow, EsquemaTabla, IngestResult, RagStats } from './rag.models';
import type { EspacioVectorial, PipelineEvent } from '../pipeline/pipeline.models';

/**
 * Acceso a la API del RAG.
 *
 * Los dos métodos importantes no devuelven un resultado: devuelven el trabajo
 * ocurriendo. El backend narra cada paso mientras lo hace, y la interfaz anima
 * eso, no una estimación.
 */
@Injectable({ providedIn: 'root' })
export class RagService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  stats() {
    return this.http.get<RagStats>(`${this.api}/rag/stats`);
  }

  documents() {
    return this.http.get<DocumentRow[]>(`${this.api}/documents`);
  }

  seed() {
    return this.http.post<IngestResult[]>(`${this.api}/documents/seed`, {});
  }

  deleteDocument(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.api}/documents/${id}`);
  }

  /**
   * El esquema real de `chunks`, leído del catálogo de Postgres.
   * Si alguien cambia la tabla, lo que se ve en pantalla cambia con ella.
   */
  esquema() {
    return this.http.get<EsquemaTabla>(`${this.api}/rag/schema`);
  }

  /** Muestra del espacio vectorial, ya proyectada a 2D por el backend. */
  espacioVectorial(opts: { q?: string; topK?: number; muestra?: number } = {}) {
    const params: Record<string, string> = {};
    if (opts.q) params['q'] = opts.q;
    if (opts.topK) params['topK'] = String(opts.topK);
    if (opts.muestra) params['muestra'] = String(opts.muestra);
    return this.http.get<EspacioVectorial>(`${this.api}/rag/vector-space`, {
      params,
    });
  }

  /**
   * Indexa un archivo narrando el pipeline.
   *
   * El backend responde NDJSON (un evento por línea) porque `EventSource` no
   * admite POST con multipart; se lee el cuerpo con `fetch` + `ReadableStream`.
   */
  indexarNarrado(
    file: File,
    opts: { docType?: string; ocr?: boolean } = {},
  ): Observable<PipelineEvent> {
    return new Observable<PipelineEvent>((subscriber) => {
      const abort = new AbortController();
      const form = new FormData();
      form.append('file', file);
      if (opts.docType) form.append('docType', opts.docType);
      if (opts.ocr === false) form.append('ocr', 'false');

      (async () => {
        try {
          const res = await fetch(`${this.api}/documents/upload/stream`, {
            method: 'POST',
            body: form,
            signal: abort.signal,
          });
          if (!res.ok || !res.body) {
            throw new Error(`El servidor respondió ${res.status}`);
          }

          const lector = res.body.getReader();
          const decodificador = new TextDecoder();
          let resto = '';

          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            resto += decodificador.decode(value, { stream: true });
            const lineas = resto.split('\n');
            // La última puede estar cortada: se guarda para el siguiente trozo.
            resto = lineas.pop() ?? '';
            for (const linea of lineas) {
              if (linea.trim()) subscriber.next(JSON.parse(linea) as PipelineEvent);
            }
          }
          if (resto.trim()) subscriber.next(JSON.parse(resto) as PipelineEvent);
          subscriber.complete();
        } catch (err) {
          if (abort.signal.aborted) return;
          subscriber.next({ fase: 'error', mensaje: (err as Error).message });
          subscriber.complete();
        }
      })();

      return () => abort.abort();
    });
  }

  /**
   * Consulta narrada: embedding de la pregunta, los dos buscadores, la fusión
   * RRF, el prompt y los tokens del modelo, en el orden en que ocurren.
   */
  preguntarNarrado(
    q: string,
    opts: { topK?: number; docType?: string } = {},
  ): Observable<PipelineEvent> {
    const params = new URLSearchParams({ q });
    if (opts.topK) params.set('topK', String(opts.topK));
    if (opts.docType) params.set('docType', opts.docType);

    return new Observable<PipelineEvent>((subscriber) => {
      const es = new EventSource(`${this.api}/rag/ask/explain?${params}`);
      let terminado = false;

      es.onmessage = (ev) => {
        const evento = JSON.parse(ev.data) as PipelineEvent;
        subscriber.next(evento);
        if (evento.fase === 'respuesta-lista' || evento.fase === 'error') {
          terminado = true;
          es.close();
          subscriber.complete();
        }
      };
      // SSE cierra el canal al terminar el generador: eso no es un fallo.
      es.onerror = () => {
        es.close();
        if (terminado) return;
        subscriber.next({
          fase: 'error',
          mensaje: 'Se cortó la conexión con el servidor',
        });
        subscriber.complete();
      };

      return () => es.close();
    });
  }
}
