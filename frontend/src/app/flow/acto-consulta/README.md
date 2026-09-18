# `flow/acto-consulta/` — Acto II, pasos 07–12

De una pregunta a una respuesta citada. Dispara `preguntarNarrado()` (SSE).

| Paso | Qué enseña                                      |
| ---- | ----------------------------------------------- |
| 07   | La pregunta convertida en vector                |
| 08   | La búsqueda por significado, sobre el mapa      |
| 09   | La búsqueda literal y los lexemas del `tsquery` |
| 10   | La fusión RRF con la cuenta escrita             |
| 11   | El prompt que de verdad se envía                |
| 12   | La respuesta en streaming y sus fuentes         |

`acto-consulta.models.ts` define `Trozo`: la respuesta partida para poder
resaltar los marcadores `[n]` y enlazarlos con su fragmento al pasar el cursor.

Si la generación falla —clave de OpenRouter caducada, normalmente— el paso 12 lo
dice ahí mismo, junto a las citas, que sí son reales.
