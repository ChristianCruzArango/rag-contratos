/**
 * Objetos de BD que se crean (o actualizan) al arrancar, además del
 * `docker/initdb/01-init.sql` que sólo corre la primera vez que se crea el
 * volumen. Todo aquí es idempotente.
 */

/**
 * Versión "explicada" de la búsqueda híbrida.
 *
 * `hybrid_search()` devuelve sólo el resultado fusionado. Esta variante saca
 * además el puesto que ocupó cada fragmento en **cada** buscador y el valor que
 * lo puso ahí (coseno para el vectorial, ts_rank_cd para el léxico), que es lo
 * que permite mostrar por qué el RRF acabó ordenándolos así.
 */
export const hybridSearchExplain = (dimensiones: number) => `
CREATE OR REPLACE FUNCTION hybrid_search_explain(
  query_embedding vector(${dimensiones}),
  query_text      TEXT,
  match_count     INT  DEFAULT 8,
  rrf_k           INT  DEFAULT 60,
  filter_doc_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id       UUID,
  document_id    UUID,
  title          TEXT,
  doc_type       TEXT,
  chunk_index    INT,
  content        TEXT,
  metadata       JSONB,
  rank_semantico INT,
  similitud      DOUBLE PRECISION,
  rank_lexico    INT,
  peso_lexico    DOUBLE PRECISION,
  score          DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $fn$
WITH consulta AS (
  SELECT websearch_to_tsquery('es_unaccent', query_text) AS tq
),
semantic AS (
  SELECT c.id,
         ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding)::int AS rank,
         (1 - (c.embedding <=> query_embedding))::double precision AS sim
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND (filter_doc_type IS NULL OR d.doc_type = filter_doc_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count * 4
),
lexical AS (
  SELECT c.id,
         ROW_NUMBER() OVER (
           ORDER BY ts_rank_cd(c.tsv, (SELECT tq FROM consulta)) DESC
         )::int AS rank,
         ts_rank_cd(c.tsv, (SELECT tq FROM consulta))::double precision AS peso
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.tsv @@ (SELECT tq FROM consulta)
    AND (filter_doc_type IS NULL OR d.doc_type = filter_doc_type)
  ORDER BY ts_rank_cd(c.tsv, (SELECT tq FROM consulta)) DESC
  LIMIT match_count * 4
)
SELECT c.id, c.document_id, d.title, d.doc_type, c.chunk_index, c.content, c.metadata,
       s.rank, s.sim, l.rank, l.peso,
       (COALESCE(1.0 / (rrf_k + s.rank), 0.0)
        + COALESCE(1.0 / (rrf_k + l.rank), 0.0))::double precision
FROM semantic s
FULL OUTER JOIN lexical l ON l.id = s.id
JOIN chunks    c ON c.id = COALESCE(s.id, l.id)
JOIN documents d ON d.id = c.document_id
ORDER BY 12 DESC;
$fn$;
`;
