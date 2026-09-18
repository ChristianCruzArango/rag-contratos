-- Extensiones necesarias para el RAG
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- búsqueda léxica / fuzzy
CREATE EXTENSION IF NOT EXISTS unaccent;     -- español sin tildes

-- Configuración de texto completo en español, insensible a tildes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'es_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION es_unaccent ( COPY = spanish );
    ALTER TEXT SEARCH CONFIGURATION es_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  source       TEXT,
  doc_type     TEXT,                       -- arrendamiento | laboral | servicios ...
  mime_type    TEXT DEFAULT 'text/plain',
  content      TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum     TEXT UNIQUE,                -- evita reindexar lo mismo
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents (doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING gin (metadata jsonb_path_ops);

-- ---------------------------------------------------------------
-- Chunks + embeddings
-- La dimensión debe coincidir con EMBEDDING_DIMENSIONS del .env:
--    384  = Xenova/multilingual-e5-small  (proveedor local, por defecto)
--    768  = nomic-embed-text              (Ollama)
--   1536  = text-embedding-3-small        (OpenAI)
-- Si cambias de modelo: ajusta EMBEDDING_DIMENSIONS y ejecuta
--   npm run db:resize-vector   (en backend/)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  token_count  INTEGER,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding    vector(384),
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('es_unaccent', content)) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv         ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_metadata    ON chunks USING gin (metadata jsonb_path_ops);

-- HNSW para distancia coseno. Se crea vacío: pgvector lo puebla al insertar.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------
-- Historial de conversaciones (para el chat del RAG)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content         TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------
-- Búsqueda híbrida: vectorial + léxica con Reciprocal Rank Fusion
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(384),
  query_text      TEXT,
  match_count     INT  DEFAULT 8,
  rrf_k           INT  DEFAULT 60,
  filter_doc_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id    UUID,
  document_id UUID,
  title       TEXT,
  doc_type    TEXT,
  chunk_index INT,
  content     TEXT,
  metadata    JSONB,
  score       DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
WITH semantic AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) AS rank
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
           ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('es_unaccent', query_text)) DESC
         ) AS rank
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.tsv @@ websearch_to_tsquery('es_unaccent', query_text)
    AND (filter_doc_type IS NULL OR d.doc_type = filter_doc_type)
  LIMIT match_count * 4
)
SELECT c.id, c.document_id, d.title, d.doc_type, c.chunk_index, c.content, c.metadata,
       COALESCE(1.0 / (rrf_k + s.rank), 0.0) + COALESCE(1.0 / (rrf_k + l.rank), 0.0) AS score
FROM semantic s
FULL OUTER JOIN lexical l ON l.id = s.id
JOIN chunks    c ON c.id = COALESCE(s.id, l.id)
JOIN documents d ON d.id = c.document_id
ORDER BY score DESC
LIMIT match_count;
$$;
