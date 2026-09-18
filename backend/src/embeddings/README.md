# `embeddings/` — Texto a vectores

Dos proveedores, elegidos por configuración o automáticamente:

- **local** — un modelo multilingüe en esta máquina (transformers.js). Gratis,
  sin API key, nada sale del equipo. Es al que se cae si no hay clave.
- **openai** — cualquier endpoint compatible con la API de OpenAI.

**OpenRouter no expone `/v1/embeddings`**, sólo chat. Por eso este módulo nunca
usa la configuración de OpenRouter, y el proyecto acaba con dos proveedores
distintos: uno genera los vectores, otro redacta la respuesta.

Los modelos de la familia E5 exigen anteponer `passage:` a lo que se indexa y
`query:` a lo que se pregunta — de ahí que haya `embedDocuments()` y
`embedQuery()` en vez de un solo método.

`onBatch` deja observar el progreso lote a lote sin acoplar el servicio a quien
mira. **Si se reescribe este servicio, hay que conservarlo**: es lo que alimenta
el paso 05 de la interfaz.
