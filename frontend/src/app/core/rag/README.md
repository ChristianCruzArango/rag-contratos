# `core/rag/` — La puerta al backend

Única salida HTTP de la aplicación. Ningún componente hace `fetch` por su
cuenta.

- `rag.service.ts` — los dos métodos importantes no devuelven un resultado sino
  **el trabajo ocurriendo**: `indexarNarrado()` lee NDJSON con `fetch` y un
  `ReadableStream` (el navegador no admite `EventSource` con POST multipart), y
  `preguntarNarrado()` abre un SSE. Los demás son peticiones normales.
- `rag.models.ts` — lo que devuelven esas peticiones normales: el listado de
  documentos y el estado del índice.

Los tipos de los **eventos** del streaming no están aquí: viven en
`core/pipeline/`, porque los comparte todo el recorrido.
