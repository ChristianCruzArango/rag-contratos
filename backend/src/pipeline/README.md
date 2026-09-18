# `pipeline/` — Lo que el backend va contando

Sólo define un contrato: `PipelineEvent`, una unión discriminada con una
variante por paso del recorrido.

No hay servicio ni módulo aquí a propósito. Es un tipo compartido que
`ingest`, `ocr`, `embeddings` y `rag` emiten, y que el frontend refleja en
`frontend/src/app/core/pipeline/`. **Si cambia aquí, hay que cambiarlo allí**:
es el único acoplamiento fuerte entre los dos lados.

Nada de lo que viaja por aquí está estimado: cada campo sale de una medición
real — caracteres extraídos, confianza del OCR, puesto en cada buscador,
dimensiones del vector.
