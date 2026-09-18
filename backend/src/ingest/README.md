# `ingest/` — De archivo a filas

- `pdf.ts` — extrae el texto **página por página** y las une con un salto de
  página. Esa marca es lo que después permite citar la página exacta.
- `chunker.ts` — corta primero por cláusula o anexo y sólo dentro de una
  demasiado larga sigue por párrafo, con solape y siempre en frontera de
  palabra. Un fragmento nunca mezcla dos cláusulas.
- `ingest.service.ts` — orquesta: extraer → OCR → trocear → vectorizar →
  escribir, todo dentro de una transacción.
- `ingest.controller.ts` — las rutas. `POST /documents/upload/stream` responde
  **NDJSON** y no SSE, porque el navegador no puede abrir un `EventSource` con
  POST y multipart.

El SHA-256 del contenido evita reindexar lo mismo: si coincide, el pipeline se
detiene antes de trocear y no se pagan embeddings de nuevo.
