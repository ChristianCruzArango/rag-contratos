# `viz/chunk-row/` — Una fila de `chunks`

El momento en que el fragmento deja de ser un objeto en memoria y pasa a ser una
fila. Muestra el valor concreto que acaba en cada columna.

Lo que el DDL solo no cuenta y aquí se ve: **dos columnas no las escribe el
backend**. El `id` lo pone Postgres con `gen_random_uuid()` y `tsv` es una
columna generada que se recalcula sola. Van marcadas.
