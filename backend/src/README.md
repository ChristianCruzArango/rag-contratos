# `backend/src` — La API del RAG

NestJS 12 en ESM. Un módulo por capacidad, que es la convención del framework:
cada carpeta agrupa su módulo, su servicio, su controlador y sus tipos.

## El camino de un documento

```
ingest.controller ─▶ ingest.service ─┬─▶ pdf.ts        extrae texto por página
                                     ├─▶ ocr.service   reconoce lo que era imagen
                                     ├─▶ chunker.ts    parte por cláusula
                                     ├─▶ embeddings    convierte en vectores
                                     └─▶ database      escribe en chunks
```

## El camino de una pregunta

```
rag.controller ─▶ rag.service ─┬─▶ embeddings   vectoriza la pregunta
                               ├─▶ database     hybrid_search_explain()
                               └─▶ llm.service  OpenRouter, en streaming
```

| Carpeta | De qué responde |
|---|---|
| `config/` | El entorno, validado al arrancar. Nadie más lee `process.env`. |
| `pipeline/` | El contrato de eventos que el backend va narrando. |
| `database/` | El pool de Postgres y los objetos de BD que se crean al arrancar. |
| `ingest/` | De archivo a filas: extracción, troceo e indexación. |
| `ocr/` | Reconocer el texto de las páginas que son una imagen. |
| `embeddings/` | Convertir texto en vectores. Local o remoto. |
| `llm/` | Hablar con OpenRouter. |
| `rag/` | Recuperar y responder. |

## Dónde viven los tipos

Cada módulo tiene su `*.types.ts` y **ninguna interfaz se declara dentro de un
servicio o un controlador**. Así el contrato de un módulo se lee de un vistazo,
sin buscarlo entre la implementación.

`pipeline.types.ts` es la excepción por naturaleza: es sólo un contrato, y por
eso su carpeta no tiene servicio ni módulo.

## La regla que atraviesa todo

Los servicios aceptan un **observador opcional** (`report?: PipelineReporter`).
Sin él se comportan como siempre; con él van contando lo que hacen mientras lo
hacen. Eso es lo que alimenta la interfaz, y por eso ninguna cifra que se ve en
pantalla está estimada en el cliente.
