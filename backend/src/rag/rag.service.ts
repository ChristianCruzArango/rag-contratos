import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { ChatMessage } from '../llm/llm.types.js';
import type {
  ColumnaTabla,
  IndiceHnsw,
  EsquemaTabla,
  IndiceTabla,
  AskResult,
  Base2D,
  Citation,
  EspacioVectorial,
  FilaExplicada,
  RetrievedChunk,
} from './rag.types.js';
import { calcularBase, coseno, parseVector, proyectar } from './projection.js';
import type {
  FilaFusion,
  HitRecuperado,
  PipelineEvent,
} from '../pipeline/pipeline.types.js';

const SYSTEM_PROMPT = `Eres un asistente jurídico que responde ÚNICAMENTE con base en los fragmentos de contratos entregados como contexto.

Reglas estrictas:
1. Si la respuesta no está en el contexto, responde exactamente: "No encuentro esa información en los documentos indexados." No inventes cláusulas, cifras ni nombres.
2. Cita siempre la fuente usando los marcadores [1], [2], ... que aparecen en el contexto, inmediatamente después de la afirmación que sustentan.
3. Cuando cites cifras, plazos, nombres de las partes o numerales de cláusula, transcríbelos literalmente del contexto.
4. Si dos fragmentos se contradicen, indícalo explícitamente y cita ambos.
5. Responde en español, de forma concreta y estructurada. No repitas el contexto completo.
6. Los fragmentos marcados con "[texto obtenido por OCR]" provienen de un documento escaneado y pueden tener errores de lectura. Si basas en uno de ellos una cifra, una fecha o un nombre propio, advierte al usuario que conviene verificarlo contra el documento original. Nunca "corrijas" un dato que se lee mal: transcríbelo tal cual y señala la duda.`;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  /** Recuperación híbrida: vectorial (pgvector) + léxica (tsvector) vía RRF. */
  async search(
    query: string,
    opts: { topK?: number; docType?: string } = {},
  ): Promise<RetrievedChunk[]> {
    const topK = opts.topK ?? this.config.get<number>('rag.topK')!;
    const embedding = await this.embeddings.embedQuery(query);

    return this.db.query<RetrievedChunk>(
      `SELECT * FROM hybrid_search($1::vector, $2::text, $3::int, 60, $4::text)`,
      [
        this.embeddings.toVectorLiteral(embedding),
        query,
        topK,
        opts.docType ?? null,
      ],
    );
  }

  /** Sólo búsqueda vectorial pura, útil para comparar calidad de recuperación. */
  async searchVector(query: string, topK = 8): Promise<RetrievedChunk[]> {
    const embedding = await this.embeddings.embedQuery(query);
    return this.db.query<RetrievedChunk>(
      `SELECT c.id AS chunk_id, c.document_id, d.title, d.doc_type, c.chunk_index,
              c.content, c.metadata,
              1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [this.embeddings.toVectorLiteral(embedding), topK],
    );
  }

  async ask(
    question: string,
    opts: { topK?: number; docType?: string } = {},
  ): Promise<AskResult> {
    const chunks = await this.search(question, opts);

    if (chunks.length === 0) {
      return {
        answer: 'No encuentro esa información en los documentos indexados.',
        citations: [],
        usedChunks: 0,
      };
    }

    const answer = await this.llm.chat(this.buildMessages(question, chunks));
    return {
      answer,
      citations: this.buildCitations(chunks),
      usedChunks: chunks.length,
    };
  }

  /** Igual que ask(), pero emitiendo el texto por partes (SSE). */
  async *askStream(
    question: string,
    opts: { topK?: number; docType?: string } = {},
  ): AsyncGenerator<
    | { type: 'citations'; data: Citation[] }
    | { type: 'token'; data: string }
    | { type: 'done' }
  > {
    const chunks = await this.search(question, opts);
    yield { type: 'citations', data: this.buildCitations(chunks) };

    if (chunks.length === 0) {
      yield {
        type: 'token',
        data: 'No encuentro esa información en los documentos indexados.',
      };
      yield { type: 'done' };
      return;
    }

    for await (const token of this.llm.chatStream(
      this.buildMessages(question, chunks),
    )) {
      yield { type: 'token', data: token };
    }
    yield { type: 'done' };
  }

  private buildMessages(
    question: string,
    chunks: RetrievedChunk[],
  ): ChatMessage[] {
    const contexto = chunks
      .map((c, i) => {
        const pag = (c.metadata as any)?.pagina;
        const sec = (c.metadata as any)?.seccion;
        const ocr = (c.metadata as any)?.ocr === true;
        return [
          `[${i + 1}] Documento: ${c.title}`,
          sec ? `Sección: ${sec}` : null,
          pag ? `Página: ${pag}` : null,
          ocr ? '[texto obtenido por OCR]' : null,
          '---',
          c.content,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n========\n\n');

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `CONTEXTO:\n\n${contexto}\n\n========\n\nPREGUNTA: ${question}`,
      },
    ];
  }

  private buildCitations(chunks: RetrievedChunk[]): Citation[] {
    return chunks.map((c, i) => ({
      n: i + 1,
      documentId: c.document_id,
      title: c.title,
      docType: c.doc_type,
      seccion: ((c.metadata as any)?.seccion as string) ?? null,
      pagina: ((c.metadata as any)?.pagina as number) ?? null,
      score: Number(c.score),
      ocr: ((c.metadata as any)?.ocr as boolean) ?? false,
      excerpt: c.content.slice(0, 320).replace(/\s+/g, ' ').trim() + '…',
    }));
  }

  /**
   * Igual que askStream(), pero narrando cada paso del pipeline: el embedding
   * de la consulta, los dos buscadores por separado, la fusión RRF, el prompt
   * que se arma y por fin los tokens del modelo.
   */
  async *askExplain(
    question: string,
    opts: { topK?: number; docType?: string } = {},
  ): AsyncGenerator<PipelineEvent> {
    const t0 = Date.now();
    const topK = opts.topK ?? this.config.get<number>('rag.topK')!;
    const docType = opts.docType ?? null;
    const rrfK = 60;

    yield { fase: 'consulta', texto: question, topK, docType };

    // 1 · La pregunta se convierte en el mismo tipo de vector que los fragmentos.
    const tEmb = Date.now();
    const embedding = await this.embeddings.embedQuery(question);
    yield {
      fase: 'consulta-embedding',
      modelo: this.embeddings.modelName,
      dimensiones: this.embeddings.dimensions,
      ms: Date.now() - tEmb,
      muestra: embedding.slice(0, 96),
    };

    // 2 · Cómo interpreta Postgres la consulta en la búsqueda léxica.
    const [{ tq }] = await this.db.query<{ tq: string }>(
      `SELECT websearch_to_tsquery('es_unaccent', $1)::text AS tq`,
      [question],
    );

    // 3 · Los dos buscadores, con el puesto que cada uno dio a cada fragmento.
    const tBusqueda = Date.now();
    const filas = await this.db.query<FilaExplicada>(
      `SELECT * FROM hybrid_search_explain($1::vector, $2::text, $3::int, $4::int, $5::text)`,
      [
        this.embeddings.toVectorLiteral(embedding),
        question,
        topK,
        rrfK,
        docType,
      ],
    );
    const msBusqueda = Date.now() - tBusqueda;

    const vectoriales = filas
      .filter((f) => f.rank_semantico !== null)
      .sort((a, b) => a.rank_semantico! - b.rank_semantico!);
    const lexicos = filas
      .filter((f) => f.rank_lexico !== null)
      .sort((a, b) => a.rank_lexico! - b.rank_lexico!);

    yield {
      fase: 'busqueda-vectorial',
      ms: msBusqueda,
      candidatos: vectoriales.length,
      hits: vectoriales
        .slice(0, 10)
        .map((f) => hitDe(f, f.rank_semantico!, f.similitud ?? 0)),
    };

    yield {
      fase: 'busqueda-lexica',
      ms: msBusqueda,
      candidatos: lexicos.length,
      tsquery: tq ?? '',
      lexemas: lexemasDe(tq ?? ''),
      hits: lexicos
        .slice(0, 10)
        .map((f) => hitDe(f, f.rank_lexico!, f.peso_lexico ?? 0)),
    };

    // 4 · Reciprocal Rank Fusion: cada buscador aporta 1/(k + su puesto).
    const ordenadas = [...filas].sort(
      (a, b) => Number(b.score) - Number(a.score),
    );
    const elegidas = ordenadas.slice(0, topK);
    const elegidasIds = new Set(elegidas.map((f) => f.chunk_id));

    yield {
      fase: 'fusion',
      k: rrfK,
      elegidos: elegidas.length,
      filas: ordenadas
        .slice(0, Math.max(topK + 6, 12))
        .map((f): FilaFusion => ({
          chunk_id: f.chunk_id,
          title: f.title,
          seccion: seccionDe(f),
          pagina: paginaDe(f),
          ocr: esOcr(f),
          excerpt: recorte(f.content),
          rank_semantico: f.rank_semantico,
          rank_lexico: f.rank_lexico,
          aporte_semantico: f.rank_semantico
            ? 1 / (rrfK + f.rank_semantico)
            : 0,
          aporte_lexico: f.rank_lexico ? 1 / (rrfK + f.rank_lexico) : 0,
          score: Number(f.score),
          elegido: elegidasIds.has(f.chunk_id),
        })),
    };

    if (elegidas.length === 0) {
      yield { fase: 'citas', citas: [] };
      yield {
        fase: 'token',
        texto: 'No encuentro esa información en los documentos indexados.',
      };
      yield { fase: 'respuesta-lista', ms: Date.now() - t0, caracteres: 0 };
      return;
    }

    // 5 · El prompt: contexto numerado + reglas de citación.
    const mensajes = this.buildMessages(question, elegidas);
    const contexto = mensajes[1].content;
    yield {
      fase: 'prompt',
      modelo: this.config.get<string>('openrouter.model')!,
      sistemaChars: SYSTEM_PROMPT.length,
      contextoChars: contexto.length,
      fragmentos: elegidas.length,
      tokensAprox: Math.ceil((SYSTEM_PROMPT.length + contexto.length) / 4),
      sistema: SYSTEM_PROMPT,
      contexto: contexto.slice(0, 4000),
    };

    yield { fase: 'citas', citas: this.buildCitations(elegidas) };

    // 6 · OpenRouter responde token a token.
    let caracteres = 0;
    for await (const token of this.llm.chatStream(mensajes)) {
      caracteres += token.length;
      yield { fase: 'token', texto: token };
    }

    yield { fase: 'respuesta-lista', ms: Date.now() - t0, caracteres };
  }

  /**
   * Muestra del espacio vectorial proyectada a 2D.
   *
   * Sirve para ver lo que pgvector hace por dentro: los fragmentos ocupan
   * posiciones según su significado, y la consulta aterriza cerca de los que
   * hablan de lo mismo.
   */
  async vectorSpace(
    opts: { q?: string; topK?: number; muestra?: number } = {},
  ): Promise<EspacioVectorial> {
    const limite = Math.min(Math.max(opts.muestra ?? 320, 40), 600);
    const topK = opts.topK ?? this.config.get<number>('rag.topK')!;

    // Muestreo determinista: la misma nube dibuja siempre el mismo mapa.
    const filas = await this.db.query<{
      id: string;
      title: string;
      doc_type: string | null;
      metadata: Record<string, unknown>;
      content: string;
      emb: string;
    }>(
      `SELECT c.id, d.title, d.doc_type, c.metadata,
              LEFT(c.content, 240) AS content, c.embedding::text AS emb
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL
       ORDER BY md5(c.id::text)
       LIMIT $1`,
      [limite],
    );

    const [{ total }] = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM chunks WHERE embedding IS NOT NULL`,
    );

    if (filas.length < 3) {
      return {
        modelo: this.embeddings.modelName,
        dimensiones: this.embeddings.dimensions,
        totalFragmentos: Number(total),
        muestra: filas.length,
        varianza: [0, 0],
        puntos: [],
        consulta: null,
        fueraDeCuadro: 0,
      };
    }

    const vectores = filas.map((f) => parseVector(f.emb));
    const base: Base2D = calcularBase(vectores.map((v) => [...v]));

    let consultaVec: number[] | null = null;
    let elegidos = new Set<string>();
    if (opts.q) {
      consultaVec = await this.embeddings.embedQuery(opts.q);
      const recuperados = await this.search(opts.q, { topK });
      elegidos = new Set(recuperados.map((r) => r.chunk_id));
    }

    const crudos = filas.map((f, i) => ({
      fila: f,
      p: proyectar(vectores[i], base),
      sim: consultaVec ? coseno(vectores[i], consultaVec) : null,
    }));

    const consultaP = consultaVec ? proyectar(consultaVec, base) : null;

    // Se normaliza a [-1, 1] para que el frontend no tenga que escalar nada.
    // No con el mínimo y el máximo: un solo fragmento raro estiraría la escala
    // y aplastaría a todos los demás en una esquina. Se usa el rango central
    // (percentiles 2–98) y lo que se sale se recorta contra el borde.
    // Centro y radio robustos: la mediana y el 90 % central. Se centra en la
    // mediana y no en el punto medio del rango porque, si la nube tiene dos
    // grupos de tamaños muy distintos, el grande debe quedar en el centro del
    // dibujo en vez de aplastado contra un borde.
    const medida = (valores: number[]) => {
      const orden = [...valores].sort((a, b) => a - b);
      const centro = percentil(orden, 0.5);
      const radio = Math.max(
        percentil(orden, 0.95) - centro,
        centro - percentil(orden, 0.05),
        1e-9,
      );
      return { centro, radio };
    };

    const mx = medida(
      crudos.map((c) => c.p.x).concat(consultaP ? [consultaP.x] : []),
    );
    const my = medida(
      crudos.map((c) => c.p.y).concat(consultaP ? [consultaP.y] : []),
    );
    // Un único radio para los dos ejes: escalarlos por separado deformaría la
    // nube y dos distancias iguales en el dibujo dejarían de significar lo
    // mismo. El primer eje se ve más ancho porque de verdad lo es.
    const radio = Math.max(mx.radio, my.radio);
    const LIMITE = 1.15;
    const escX = (v: number) => (v - mx.centro) / radio;
    const escY = (v: number) => (v - my.centro) / radio;
    const recorta = (v: number) => Math.max(-LIMITE, Math.min(LIMITE, v));

    return {
      modelo: this.embeddings.modelName,
      dimensiones: this.embeddings.dimensions,
      totalFragmentos: Number(total),
      muestra: filas.length,
      varianza: base.varianza,
      puntos: crudos.map((c) => {
        const x = escX(c.p.x);
        const y = escY(c.p.y);
        return {
          id: c.fila.id,
          x: recorta(x),
          y: recorta(y),
          fuera: Math.abs(x) > LIMITE || Math.abs(y) > LIMITE,
          titulo: c.fila.title,
          tipo: c.fila.doc_type,
          seccion: (c.fila.metadata?.['seccion'] as string) ?? null,
          pagina: (c.fila.metadata?.['pagina'] as number) ?? null,
          ocr: c.fila.metadata?.['ocr'] === true,
          similitud: c.sim,
          elegido: elegidos.has(c.fila.id),
          excerpt: c.fila.content.replace(/\s+/g, ' ').trim(),
        };
      }),
      consulta: consultaP
        ? {
            x: recorta(escX(consultaP.x)),
            y: recorta(escY(consultaP.y)),
            texto: opts.q!,
          }
        : null,
      fueraDeCuadro: crudos.filter(
        (c) => Math.abs(escX(c.p.x)) > LIMITE || Math.abs(escY(c.p.y)) > LIMITE,
      ).length,
    };
  }

  /**
   * El esquema real de `chunks`, leído del catálogo y con el `CREATE TABLE`
   * reconstruido a partir de él.
   */
  async esquema(tabla = 'chunks'): Promise<EsquemaTabla> {
    const { columnas, indices } = await this.db.describeTable(tabla);

    const cols: ColumnaTabla[] = columnas.map((c) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      noNulo: c.no_nulo,
      defecto: c.defecto,
      generada: c.generada,
    }));

    const idx: IndiceTabla[] = indices.map((i) => ({
      nombre: i.nombre,
      definicion: i.definicion.replace(/ ON public\./, ' ON '),
      metodo: /USING (\w+)/.exec(i.definicion)?.[1] ?? '',
    }));

    return {
      tabla,
      columnas: cols,
      indices: idx,
      ddl: componerDdl(tabla, cols),
      hnsw: await this.hnsw(tabla),
    };
  }

  /** Parámetros medidos del índice vectorial, si la tabla tiene uno. */
  private async hnsw(tabla: string): Promise<IndiceHnsw | null> {
    const p = await this.db.hnswParams(tabla, 'embedding');
    if (!p) return null;

    // reloptions llega como ['m=16', 'ef_construction=64']
    const opciones = Object.fromEntries(
      (p.opciones ?? []).map((o) => o.split('=') as [string, string]),
    );

    return {
      nombre: p.nombre,
      m: Number(opciones['m'] ?? 16),
      efConstruction: Number(opciones['ef_construction'] ?? 64),
      efSearch: p.efSearch,
      filas: p.filas,
      tamano: p.tamano,
      definicion: p.definicion.replace(/ ON public\./, ' ON '),
    };
  }

  async stats() {
    const [row] = await this.db.query<{
      documentos: string;
      fragmentos: string;
      con_embedding: string;
      tipos: string;
      ocr: string;
    }>(
      `SELECT (SELECT COUNT(*) FROM documents)::text AS documentos,
              (SELECT COUNT(*) FROM chunks)::text AS fragmentos,
              (SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL)::text AS con_embedding,
              (SELECT COUNT(DISTINCT doc_type) FROM documents)::text AS tipos,
              (SELECT COUNT(*) FROM chunks WHERE metadata->>'ocr' = 'true')::text AS ocr`,
    );
    return {
      documentos: Number(row.documentos),
      fragmentos: Number(row.fragmentos),
      fragmentosConEmbedding: Number(row.con_embedding),
      fragmentosOcr: Number(row.ocr),
      tiposDeDocumento: Number(row.tipos),
      // La interfaz explica el pipeline: necesita decir el modelo y el tamaño
      // del vector de verdad, no uno escrito a mano.
      dimensiones: this.embeddings.dimensions,
      modeloEmbeddings: this.embeddings.modelName,
    };
  }
}

// ── Utilidades del pipeline explicado ───────────────────────────────────────

function seccionDe(f: RetrievedChunk): string | null {
  return (
    ((f.metadata as Record<string, unknown>)?.['seccion'] as string) ?? null
  );
}
function paginaDe(f: RetrievedChunk): number | null {
  return (
    ((f.metadata as Record<string, unknown>)?.['pagina'] as number) ?? null
  );
}
function esOcr(f: RetrievedChunk): boolean {
  return (f.metadata as Record<string, unknown>)?.['ocr'] === true;
}
function recorte(texto: string, n = 240): string {
  return (
    texto.slice(0, n).replace(/\s+/g, ' ').trim() +
    (texto.length > n ? '…' : '')
  );
}

function hitDe(f: RetrievedChunk, rank: number, valor: number): HitRecuperado {
  return {
    chunk_id: f.chunk_id,
    title: f.title,
    doc_type: f.doc_type,
    seccion: seccionDe(f),
    pagina: paginaDe(f),
    ocr: esOcr(f),
    excerpt: recorte(f.content),
    rank,
    valor: Number(valor),
  };
}

/**
 * Lexemas de un tsquery: `'canon' & 'arrend'` -> ['canon', 'arrend'].
 * Es la forma en que Postgres ve la pregunta tras quitar tildes y lematizar.
 */
function lexemasDe(tsquery: string): string[] {
  return [...tsquery.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Valor en un percentil de una lista ya ordenada. */
function percentil(orden: number[], q: number): number {
  if (!orden.length) return 0;
  const i = (orden.length - 1) * q;
  const bajo = Math.floor(i);
  const alto = Math.ceil(i);
  return bajo === alto
    ? orden[bajo]
    : orden[bajo] + (orden[alto] - orden[bajo]) * (i - bajo);
}

/**
 * Rehace el `CREATE TABLE` a partir de las columnas que devolvió el catálogo.
 * Alinea los tipos en columna para que se lea como el DDL que uno escribiría.
 */
function componerDdl(tabla: string, columnas: ColumnaTabla[]): string {
  const anchoNombre = Math.max(...columnas.map((c) => c.nombre.length));
  const lineas = columnas.map((c) => {
    const nombre = c.nombre.padEnd(anchoNombre);
    const partes = [`  ${nombre}  ${c.tipo}`];
    if (c.generada && c.defecto) {
      partes.push(`GENERATED ALWAYS AS (${c.defecto}) STORED`);
    } else {
      if (c.noNulo) partes.push('NOT NULL');
      if (c.defecto) partes.push(`DEFAULT ${c.defecto}`);
    }
    return partes.join(' ');
  });
  return `CREATE TABLE ${tabla} (\n${lineas.join(',\n')}\n);`;
}
