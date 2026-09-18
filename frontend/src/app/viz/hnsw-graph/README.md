# `viz/hnsw-graph/` — El índice por capas

Explica por qué la búsqueda no recorre la tabla entera.

## Qué es real y qué es dibujo

**Real, leído de Postgres** (`GET /api/rag/schema`): `m`, `ef_construction`,
`ef_search`, las filas con vector y lo que el índice ocupa en disco.

**Real, derivado de eso**: cuántas capas hay y cuántos nodos tiene cada una. No
es una aproximación inventada — es la regla con la que HNSW se construye: con
`m` vecinos por nodo, cada capa tiene del orden de `m` veces menos nodos que la
de abajo, así que el número de capas es `log_m(filas)`. El dibujo cambia cuando
cambia el índice: con la tabla vacía no hay capas que enseñar.

**Dibujo**: las posiciones de los círculos y el camino del descenso. El grafo
interno de HNSW no se puede leer desde SQL —pgvector no lo expone— y el pie del
gráfico lo dice con todas las letras.

Los círculos que se pintan son **una muestra**, nunca todos: la capa 0 puede
tener miles de nodos y el rótulo de cada capa da su número real.
