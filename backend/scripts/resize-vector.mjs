/**
 * Cambia la dimensión de la columna `embedding` a EMBEDDING_DIMENSIONS.
 * Necesario si cambias de modelo de embeddings (p. ej. 384 -> 1536).
 * ATENCIÓN: borra los embeddings existentes; hay que reindexar después.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const p of ['../.env', '../../.env']) {
  try {
    for (const line of readFileSync(resolve(__dirname, p), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

const dims = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '384', 10);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log(`Redimensionando chunks.embedding a vector(${dims})…`);
await client.query('DROP INDEX IF EXISTS idx_chunks_embedding_hnsw');
await client.query(`ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(${dims}) USING NULL`);
await client.query(`CREATE INDEX idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);

// La función de búsqueda híbrida también declara la dimensión
await client.query('DROP FUNCTION IF EXISTS hybrid_search(vector, text, int, int, text)');
const sql = readFileSync(resolve(__dirname, '../../docker/initdb/01-init.sql'), 'utf8');
const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION hybrid_search'));
// Sustituye cualquier dimensión declarada en el SQL, no una fija.
await client.query(fn.replace(/vector\(\d+\)/g, `vector(${dims})`));

await client.query('UPDATE documents SET chunk_count = 0');
await client.query('DELETE FROM chunks');
console.log('Listo. Vuelve a indexar: POST /api/documents/seed');
await client.end();
