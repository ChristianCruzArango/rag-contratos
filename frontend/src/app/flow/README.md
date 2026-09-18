# `flow/` — La página y los dos actos

Quien orquesta. Es el único sitio que inyecta servicios y reparte datos a los
dibujos de `viz/`.

| Carpeta          | Qué es                                                      |
| ---------------- | ----------------------------------------------------------- |
| `flow-page/`     | La página: compone los cuatro bloques y acompaña el scroll. |
| `portada/`       | Qué es RAG y qué hay indexado ahora mismo.                  |
| `acto-ingesta/`  | Pasos 01–06: de PDF a filas en `chunks`.                    |
| `acto-consulta/` | Pasos 07–12: de pregunta a respuesta citada.                |
| `archivo/`       | El índice actual, y de dónde sembrarlo.                     |

`acto.scss` está suelto a este nivel porque **lo comparten los dos actos**: es
estilo genuinamente común (bandas, cifras, zona de subida), no de uno solo.
