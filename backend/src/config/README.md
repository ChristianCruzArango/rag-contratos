# `config/` — El entorno

**Ningún servicio lee `process.env`, y ninguno lleva su propio valor por
defecto.** Antes los llevaban esparcidos: `embeddings.dimensions` llegó a
aparecer con `1536` en una línea y `384` dos más abajo, en el mismo archivo.

- `env.validation.ts` — la única fuente de verdad. Una clase con las variables y
  sus reglas: lo que lleva valor inicial es un ajuste opcional, lo que no lo
  lleva es obligatorio en el `.env`. Si falta algo, **el proceso no arranca** y
  dice cuál:

  ```
  Error: Configuración inválida. Revisa el .env:
    DATABASE_URL: DATABASE_URL should not be empty
  ```

- `*.config.ts` — una fábrica `registerAs` por dominio, que sólo lee del entorno
  ya validado. Son las que dan los espacios de nombres `app.*`, `database.*`,
  `openrouter.*`, `embeddings.*`, `ocr.*` y `rag.*`.

Se usa `class-validator`, que ya estaba en el proyecto, en lugar de Joi.
