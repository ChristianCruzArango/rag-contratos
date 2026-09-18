# `viz/` — Los dibujos

Cada uno recibe sus datos por `input()` y **no habla con ningún servicio**: son
funciones puras de datos a píxeles, reutilizables en cualquier sitio.

| Carpeta | Qué dibuja | Paso |
|---|---|---|
| `page-grid/` | Las páginas del PDF, una a una, con su densidad de texto | 02 · 03 |
| `chunk-river/` | El texto partido en fragmentos, con las costuras del solape | 04 |
| `embedding-forge/` | Cómo se fabrica un embedding, etapa por etapa | 05 |
| `vector-strip/` | Un embedding como barras con signo — **el elemento firma** | 05 · 07 |
| `chunk-row/` | Una fila de `chunks`, columna a columna | 06 |
| `vector-space/` | El espacio vectorial de pgvector proyectado a 2D | 06 · 08 |
| `hnsw-graph/` | Esquema del índice por capas | 06 |
| `cosine-dial/` | El ángulo entre la consulta y un fragmento | 08 |
| `rrf-fusion/` | Las dos listas fundiéndose en una | 10 |

## El código de color, en toda la pieza

| Color | Significa |
|---|---|
| violeta | lo semántico: vectores, coseno, HNSW |
| verde | lo literal: `tsvector`, coincidencia exacta |
| ámbar | lo incierto: página sin texto, OCR, confianza baja |

En el mapa vectorial el color cambia de significado a propósito —ahí codifica el
tipo de contrato— y por eso es el único que lleva leyenda.
