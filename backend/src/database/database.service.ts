import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { hybridSearchExplain } from './schema-extras.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get<string>('database.url'),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    this.pool.on('error', (err) =>
      this.logger.error(`Error inesperado en el pool: ${err.message}`),
    );
    await this.applyExtras();
  }

  /**
   * Crea los objetos que no están en `01-init.sql` (ese script sólo corre al
   * crear el volumen). Es idempotente y no debe tumbar el arranque si la BD
   * todavía no está lista.
   */
  private async applyExtras() {
    const dimensiones = this.config.get<number>('embeddings.dimensions')!;
    try {
      await this.pool.query(hybridSearchExplain(dimensiones));
      this.logger.log(`hybrid_search_explain() lista (vector ${dimensiones}d)`);
    } catch (err) {
      this.logger.warn(
        `No se pudo preparar hybrid_search_explain(): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.pool.query<T>(text, params as never[]);
    return res.rows;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Describe una tabla leyendo el catálogo de Postgres.
   *
   * Es la única forma honesta de enseñar un esquema: lo que se pinta en la
   * interfaz sale de la tabla que existe, no de un texto escrito a mano que
   * puede quedarse desfasado en cuanto alguien toque una columna.
   */
  async describeTable(tabla: string) {
    const columnas = await this.query<{
      nombre: string;
      tipo: string;
      no_nulo: boolean;
      generada: boolean;
      defecto: string | null;
    }>(
      `SELECT a.attname                               AS nombre,
              format_type(a.atttypid, a.atttypmod)    AS tipo,
              a.attnotnull                            AS no_nulo,
              a.attgenerated <> ''                    AS generada,
              pg_get_expr(d.adbin, d.adrelid)         AS defecto
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      [tabla],
    );

    const indices = await this.query<{ nombre: string; definicion: string }>(
      `SELECT indexname AS nombre, indexdef AS definicion
       FROM pg_indexes WHERE tablename = $1 ORDER BY indexname`,
      [tabla],
    );

    return { columnas, indices };
  }

  /**
   * Parámetros reales del índice HNSW de una tabla.
   *
   * `ef_search` es una variable de la extensión y sólo existe una vez que
   * pgvector se ha cargado en la conexión, de ahí el `LOAD` previo y el uso de
   * una sola conexión para las dos consultas.
   */
  async hnswParams(tabla: string, columna: string) {
    return this.transaction(async (client) => {
      const idx = await client.query<{
        nombre: string;
        opciones: string[] | null;
        definicion: string;
        tamano: string;
      }>(
        `SELECT i.relname AS nombre,
                i.reloptions AS opciones,
                pg_get_indexdef(i.oid) AS definicion,
                pg_size_pretty(pg_relation_size(i.oid)) AS tamano
         FROM pg_class i
         JOIN pg_index x ON x.indexrelid = i.oid
         JOIN pg_am am ON am.oid = i.relam
         WHERE x.indrelid = $1::regclass AND am.amname = 'hnsw'
         LIMIT 1`,
        [tabla],
      );
      if (!idx.rows.length) return null;

      const [{ filas }] = (
        await client.query<{ filas: string }>(
          `SELECT COUNT(*)::text AS filas FROM ${tabla} WHERE ${columna} IS NOT NULL`,
        )
      ).rows;

      let efSearch: number | null = null;
      try {
        // `SHOW` nombra la columna como la propia variable, así que se pide
        // con current_setting() para poder darle un alias.
        await client.query(`LOAD 'vector'`);
        const r = await client.query<{ ef: string }>(
          `SELECT current_setting('hnsw.ef_search') AS ef`,
        );
        efSearch = Number(r.rows[0]?.ef ?? 0) || null;
      } catch {
        /* la variable sólo existe con la extensión cargada */
      }

      return { ...idx.rows[0], filas: Number(filas), efSearch };
    });
  }

  /** Comprueba conexión y que la extensión pgvector esté instalada. */
  async health() {
    const [{ version }] = await this.query<{ version: string }>(
      `SELECT extversion AS version FROM pg_extension WHERE extname = 'vector'`,
    );
    const [{ docs }] = await this.query<{ docs: string }>(
      'SELECT COUNT(*)::text AS docs FROM documents',
    );
    const [{ chunks }] = await this.query<{ chunks: string }>(
      'SELECT COUNT(*)::text AS chunks FROM chunks',
    );
    return {
      pgvector: version,
      documents: Number(docs),
      chunks: Number(chunks),
    };
  }
}
