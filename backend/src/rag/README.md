# `rag/` — Recuperar y responder

**Recuperación híbrida.** Dos búsquedas a la vez sobre la misma tabla: vectorial
con pgvector y léxica con `tsvector` en español sin tildes. Se fusionan con
*Reciprocal Rank Fusion* — cada lista aporta `1/(k+puesto)`, con k = 60 — porque
sus puntuaciones no son comparables entre sí: una es un coseno y la otra un
`ts_rank_cd`.

Cada buscador es fuerte donde el otro es débil: los vectores captan paráfrasis,
el texto completo acierta con cifras y números de cláusula.

**Generación.** Los fragmentos van numerados `[1] [2] …` con su documento,
cláusula y página, y el *system prompt* obliga a responder sólo con eso.

- `askExplain()` — la misma consulta, narrada paso a paso por SSE.
- `projection.ts` — proyecta los embeddings a 2D para poder dibujarlos. Busca
  los dos ejes en los que la nube más se estira (PCA por iteración de potencia,
  sin construir la matriz de covarianza). Lo que sale es **una sombra**: se
  pierde información, pero lo que sale junto en el dibujo estaba junto de verdad.
