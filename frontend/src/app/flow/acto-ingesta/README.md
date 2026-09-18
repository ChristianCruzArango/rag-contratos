# `flow/acto-ingesta/` — Acto I, pasos 01–06

De un PDF a filas en `chunks`. Dispara `indexarNarrado()` y va repartiendo los
eventos que llegan.

| Paso | Qué enseña                                              |
| ---- | ------------------------------------------------------- |
| 01   | La zona de subida y lo que se sabe del archivo          |
| 02   | Las páginas y cuántas volvieron vacías                  |
| 03   | El OCR, página a página y con su confianza              |
| 04   | El troceo por cláusula y el solape                      |
| 05   | Cómo se fabrica un embedding, y los lotes               |
| 06   | El DDL, una fila columna a columna, el mapa y el índice |

**Caso a no olvidar:** si el SHA-256 del contenido coincide con un documento ya
indexado, el backend se detiene antes de trocear. Los pasos 04–06 lo dicen en
vez de quedarse esperando para siempre.
