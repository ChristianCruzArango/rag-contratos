# `database/` — Postgres

Módulo global: el pool se inyecta en cualquier parte sin importar el módulo.

- `database.service.ts` — el pool, `query()`, `transaction()` y el chequeo de
  salud que informa de la versión de pgvector.
- `schema-extras.ts` — objetos de BD que **se crean al arrancar**, porque
  `docker/initdb/01-init.sql` sólo corre la primera vez que se crea el volumen.
  Todo aquí es idempotente.

El extra que vive aquí es `hybrid_search_explain()`. La función normal devuelve
sólo el resultado fusionado; ésta saca además **el puesto que ocupó cada
fragmento en cada buscador**, que es lo que permite mostrar por qué el RRF acabó
ordenándolos así. Se genera con la dimensión de vector configurada, así que
cambiar de modelo de embeddings no la deja obsoleta.
