# RAG Contratos — Angular + NestJS + PostgreSQL/pgvector + OpenRouter

Sistema RAG (Retrieval-Augmented Generation) sobre contratos en PDF: los
documentos se trocean, se convierten en embeddings, se guardan en PostgreSQL con
**pgvector** y se consultan mediante **búsqueda híbrida** (vectorial + texto
completo en español). Las respuestas las genera un modelo vía **OpenRouter** y
siempre citan documento, cláusula y página.

Incluye **OCR** para contratos escaneados: un PDF que es una foto no contiene
texto y, sin OCR, entraría al índice vacío.

```
rag-app/
├── docker-compose.yml        Postgres 17 + pgvector (y pgAdmin opcional)
├── docker/initdb/01-init.sql Esquema, índices HNSW y función hybrid_search()
├── .env / .env.example       Configuración (BD, OpenRouter, embeddings, RAG)
├── seed-data/                10 contratos PDF de ~100 páginas + manifest.json
├── backend/                  API NestJS 12 (ESM)
└── frontend/                 SPA Angular 22 (standalone + signals)
```

---

## 1. Requisitos

- Node.js 20+ (probado con 24)
- Docker Desktop
- Una API key de **OpenRouter** (generación) → https://openrouter.ai/keys
- Un proveedor de **embeddings** (ver el aviso de abajo)

### ⚠️ Importante sobre los embeddings

**OpenRouter no expone un endpoint `/v1/embeddings`** — verificado contra su
catálogo: 445 modelos, ninguno de embeddings. Solo sirve para *chat*. Por eso el
proyecto separa las dos cosas en el `.env`:

| Función | Variable | Proveedor |
|---|---|---|
| Generar la respuesta | `OPENROUTER_*` | OpenRouter |
| Generar los embeddings | `EMBEDDING_*` | Local, u otra API compatible con OpenAI |

**Por defecto se usan embeddings locales**: `Xenova/multilingual-e5-small`
ejecutado en tu máquina con transformers.js. Sin API key, sin coste y sin enviar
nada fuera. Se descarga solo la primera vez (~120 MB) y da 384 dimensiones.

```env
EMBEDDING_PROVIDER=local
EMBEDDING_LOCAL_MODEL=Xenova/multilingual-e5-small
EMBEDDING_DIMENSIONS=384
```

Medido aquí: indexar los 10 contratos (4.134 fragmentos) tarda **4m46s** y cuesta
**USD 0**.

Alternativas si prefieres un proveedor remoto:

```env
# OpenAI — más rápido y algo mejor; ~USD 0,05 indexar los 10 contratos
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sk-…
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# Ollama local — gratis, requiere instalar Ollama
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

Al cambiar de modelo, ajusta `EMBEDDING_DIMENSIONS` y ejecuta
`npm run db:resize-vector` en `backend/` (redimensiona la columna `vector(n)`,
recrea el índice HNSW y la función SQL, y borra los embeddings para reindexar).

### Qué modelo usar para responder

Probados sobre una tarea real de este RAG (citar con `[1]`, transcribir cifras
literales y negarse a inventar). **Los cuatro la superaron**, así que la
diferencia está en latencia y coste:

| Modelo | USD/1M in | USD/1M out | USD/1.000 consultas | Latencia | Notas |
|---|---|---|---|---|---|
| **`google/gemini-2.5-flash-lite`** ← por defecto | 0,10 | 0,40 | **0,80** | **0,7 s** | 1M de contexto, con visión |
| `mistralai/mistral-nemo` | 0,019 | 0,030 | **0,13** | 4,7 s | El más barato |
| `deepseek/deepseek-v4-flash` | 0,05 | 0,099 | 0,35 | 2,1 s | 1M de contexto |
| `qwen/qwen3.7-flash` | 0,03 | 0,13 | 0,24* | 7–11 s | *Gasta tokens de razonamiento: sale más caro de lo que indica la tarifa |

Se eligió `gemini-2.5-flash-lite` porque en un chat la latencia se nota más que
la diferencia de coste (0,80 vs 0,13 USD **por mil** consultas), y además sirve
como motor de OCR por visión. Si el objetivo es el mínimo coste absoluto, cambia
a `mistralai/mistral-nemo`.

---

## 2. Puesta en marcha

```bash
# 1. Configura las claves
cp .env.example .env     # ya existe un .env listo; edita las API keys

# 2. Levanta PostgreSQL con pgvector
docker compose up -d postgres

# 3. Backend
cd backend && npm install && npm run start:dev      # http://localhost:3000/api

# 4. Frontend (en otra terminal)
cd frontend && npm install && npm start             # http://localhost:4200
```

> El puerto de Postgres es **5434** (el 5432 y el 5433 estaban ocupados en esta
> máquina). Se cambia en `.env` con `POSTGRES_PORT` y `DATABASE_URL`.

### Indexar los contratos de prueba

Desde la interfaz: al final del recorrido, en **El archivo → «Indexar contratos
de prueba»**. O por API:

```bash
curl -X POST http://localhost:3000/api/documents/seed -H 'Content-Type: application/json' -d '{}'
```

Tarda unos minutos: son ~4.100 fragmentos y otras tantas llamadas de embeddings.

---

## 3. Los 10 contratos de prueba

Generados sintéticamente en **PDF real** (portada, cláusulas numeradas, anexos
con tablas, pie de página y firmas). Son ficticios, pero cada uno tiene partes,
cifras, fechas y números de contrato **únicos**, de modo que se puede verificar
si el RAG recupera exactamente el fragmento correcto.

| # | Archivo | Tipo | Páginas |
|---|---|---|---|
| 01 | arrendamiento-vivienda.pdf | arrendamiento | 100 |
| 02 | arrendamiento-local.pdf | arrendamiento | 100 |
| 03 | laboral-indefinido.pdf | laboral | 101 |
| 04 | laboral-fijo.pdf | laboral | 101 |
| 05 | servicios-juridicos.pdf | jurídico | 99 |
| 06 | cuota-litis.pdf | jurídico | 101 |
| 07 | confidencialidad-nda.pdf | confidencialidad | 100 |
| 08 | servicios-tecnologia.pdf | servicios | 99 |
| 09 | suministro-mercantil.pdf | comercial | 99 |
| 10 | mandato-representacion.pdf | jurídico | 99 |

**999 páginas en total.** Se regeneran (con otras cifras) con:

```bash
cd backend
npm run seed:generate            # 10 PDFs de ~100 páginas
npm run seed:generate:small      # versión ligera de ~10 páginas para iterar
node scripts/generate-contracts.mjs --pages 50 --txt   # también vuelca el .txt
```

---

## 4. API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/rag/health` | Estado de la BD y versión de pgvector |
| `GET` | `/api/rag/stats` | Documentos y fragmentos indexados |
| `GET` | `/api/rag/search?q=…&topK=8&docType=` | Búsqueda híbrida **sin** LLM |
| `GET` | `/api/rag/search/vector?q=…` | Solo similitud vectorial |
| `POST` | `/api/rag/ask` | Pregunta + respuesta con citas |
| `GET` | `/api/rag/ask/stream?q=…` | Igual, en streaming (SSE) |
| `GET` | `/api/rag/ask/explain?q=…` | El pipeline de consulta narrado paso a paso (SSE) |
| `GET` | `/api/rag/vector-space?q=…&muestra=320` | Muestra del espacio vectorial proyectada a 2D (PCA) |
| `GET` | `/api/documents` | Documentos indexados |
| `POST` | `/api/documents/seed` | Indexa `seed-data/` |
| `POST` | `/api/documents/upload` | Sube e indexa un PDF (nativo o escaneado), texto o imagen |
| `POST` | `/api/documents/upload/stream` | Igual, narrando el pipeline en NDJSON |
| `POST` | `/api/documents/text` | Indexa texto plano |
| `DELETE` | `/api/documents/:id` | Borra documento y sus fragmentos |

```bash
curl -X POST http://localhost:3000/api/rag/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"¿Cómo se reajusta el canon de arrendamiento?","docType":"arrendamiento"}'
```

---

## 5. Cómo funciona

**Ingesta.** `unpdf` extrae el texto **página por página** (unidas con `\f`, lo
que permite citar la página exacta). El chunker parte primero por cláusula o
anexo —detecta `CLÁUSULA <ORDINAL>.` y `ANEXO <n>.`— y luego por párrafo hasta
`CHUNK_SIZE` con solape de `CHUNK_OVERLAP`, cortando en frontera de palabra. Un
fragmento nunca mezcla dos cláusulas distintas y lleva en su `metadata` la
cláusula y la página. El SHA-256 del contenido evita reindexar lo mismo.

**Almacenamiento.** `chunks.embedding` es `vector(1536)` con índice **HNSW**
(`vector_cosine_ops`). En paralelo, una columna generada `tsv` mantiene el
`tsvector` con una configuración de texto completo en español **insensible a
tildes** (`spanish` + `unaccent`), así que "divulgacion" encuentra "divulgación".

**Recuperación.** La función SQL `hybrid_search()` ejecuta las dos búsquedas y
las fusiona con **Reciprocal Rank Fusion** (`1/(k+rank)`, k=60). Esto compensa
el punto débil de cada una: los vectores captan sinónimos y paráfrasis; el texto
completo acierta con cifras, números de cláusula y nombres propios exactos.

**Generación.** Los fragmentos se numeran `[1] [2] …` en el prompt, con su
documento, cláusula y página. El *system prompt* obliga a responder solo con el
contexto, a citar con esos marcadores y a decir *"No encuentro esa información
en los documentos indexados"* cuando no esté. Se envía a OpenRouter con
`temperature 0.2`.

---

## 5 bis. El recorrido — la interfaz

El frontend no es un formulario con una caja de chat: es **el pipeline hecho
visible**. Doce pasos numerados, de cuando el PDF entra a cuando el modelo
responde citándolo, y cada uno se anima con lo que el servidor está midiendo en
ese momento — no con tiempos simulados.

**Acto I · Guardar** (subir un PDF)

| # | Paso | Qué muestra, medido |
|---|---|---|
| 01 | Llega el archivo | nombre, peso real, formato detectado por los primeros bytes |
| 02 | Se abre el PDF | una hoja por página, con tantas rayas como texto se le sacó; en ámbar las que vinieron vacías |
| 03 | Lo que no se deja leer | el OCR página a página, en vivo, con su confianza y una muestra del texto reconocido |
| 04 | Se parte en fragmentos | los fragmentos reales, su cláusula, su página y el solape entre ellos |
| 05 | Cada fragmento, un vector | el embedding dibujado celda a celda, lote a lote |
| 06 | Todo cae en pgvector | el DDL real, el mapa 2D del índice y el esquema del grafo HNSW |

**Acto II · Preguntar**

| # | Paso | Qué muestra, medido |
|---|---|---|
| 07 | La pregunta se vuelve vector | el embedding de la consulta, mismo modelo que los fragmentos |
| 08 | Buscar por significado | la consulta situada en la nube, con líneas a los elegidos, y el coseno del mejor |
| 09 | Buscar al pie de la letra | los lexemas del `tsquery` y los aciertos literales |
| 10 | Juntar las dos listas | cada fila con su puesto en cada buscador y la cuenta `1/(60+n)` escrita |
| 11 | Armar el prompt | el system prompt y el contexto numerado que de verdad se envía |
| 12 | OpenRouter responde | los tokens llegando, con los marcadores `[n]` enlazados a su fuente |

### Cómo está hecho

El backend emite un evento por cada paso mientras trabaja
(`backend/src/pipeline/pipeline.types.ts` define el contrato). Los servicios
aceptan un observador opcional, así que las llamadas normales no cambian:

```ts
await ingest.ingestFile({ filename, buffer, report: (evento) => … });
```

- **Ingesta** → `POST /api/documents/upload/stream`, NDJSON. No es SSE porque
  `EventSource` no admite POST con multipart; el cliente lo lee con `fetch` y un
  `ReadableStream`.
- **Consulta** → `GET /api/rag/ask/explain`, SSE.
- **Mapa vectorial** → `GET /api/rag/vector-space`. Muestrea fragmentos con sus
  embeddings, calcula los dos componentes principales por iteración de potencia
  (`backend/src/rag/projection.ts`) y devuelve las coordenadas ya normalizadas.
  Con `q`, además proyecta la consulta sobre la misma base y da su coseno con
  cada punto.
- **Los dos rankings por separado** → la función SQL `hybrid_search_explain()`,
  que además del resultado fusionado devuelve el puesto que cada fragmento
  ocupó en cada buscador. Se crea sola al arrancar
  (`backend/src/database/schema-extras.ts`), sin necesidad de recrear el volumen.

La animación es **GSAP** con tres curvas propias (`tinta`, `pliego`, `sello`) y
respeta `prefers-reduced-motion`: con movimiento reducido todo aparece igual,
sólo que sin transición. Si el JS de movimiento no arranca, el contenido se ve
de todas formas.

### Tema

Hay **tema claro y oscuro**, con el interruptor al final del margen izquierdo
(abajo del todo) y la elección recordada en `localStorage`. Arranca en claro:
el recorrido es sobre todo texto para leer con calma.

Los dos temas comparten un mismo juego de tokens en `src/styles.scss`. La regla
que los mantiene coherentes es que **nada se escribe con un color fijo**: todo lo
que se sobreimprime —hilos, velos, realces— se expresa como
`rgb(var(--luz) / n%)`, y `--luz` se invierte con el tema. Los tres colores de
señal se oscurecen en claro para seguir cumpliendo contraste AA sobre papel.

---

## 6. OCR — contratos escaneados

### Por qué hace falta

Un PDF puede ser dos cosas muy distintas:

| | PDF nativo | PDF escaneado |
|---|---|---|
| Cómo se creó | Exportado desde Word, un sistema, etc. | Fotografiado o pasado por el escáner |
| Qué contiene | Caracteres reales | Una **imagen** de la página |
| Texto extraíble | Sí | **Ninguno** |
| Se puede buscar/copiar | Sí | No |

Los dos se abren igual en un visor —un humano los lee sin notar la diferencia—
pero para el programa el segundo es una foto. Al extraer su texto devuelve
cadena vacía, así que el documento se indexaría con **0 fragmentos**: invisible
para el RAG, y el modelo respondería *"No encuentro esa información"* sobre un
contrato que sí está cargado.

**OCR** (*Optical Character Recognition*, reconocimiento óptico de caracteres)
es lo que convierte esa imagen en texto: analiza la forma de cada mancha de
tinta y decide qué carácter es. Es lo que hace que un escaneo pase de ser una
foto a ser texto buscable.

Comprobación sobre los archivos de este proyecto:

```
01-arrendamiento-vivienda.pdf              100 páginas   chars/pág: 483, 3108, 3394…
01-arrendamiento-vivienda-escaneado.pdf      8 páginas   chars/pág: 0, 0, 0, 0…
```

### Cómo funciona aquí

En modo `auto` (por defecto) el backend:

1. Extrae la capa de texto del PDF, página por página.
2. Marca como "sin texto" las páginas que no llegan a `OCR_MIN_CHARS` (120).
3. Solo esas se rasterizan a imagen (`unpdf` + `@napi-rs/canvas`) y pasan por OCR.
4. El texto reconocido se inserta en el lugar de esa página.
5. Cada fragmento resultante queda marcado con `ocr: true` en su metadata, el
   documento guarda un informe (`motor`, `páginas`, `confianza_media`) y la
   interfaz muestra una etiqueta **OCR** en la cita.

Un PDF nativo no paga OCR, y un escaneo solo lo paga en las páginas que lo
necesitan. Medido en esta máquina:

| Archivo | Páginas | OCR | Tiempo de indexación |
|---|---|---|---|
| `09-suministro-mercantil.pdf` (nativo) | 99 | no | **1,9 s** |
| `01-…-escaneado.pdf` | 8 | sí | **13,1 s** |

### Motores

| | `tesseract` (por defecto) | `vision` |
|---|---|---|
| Dónde corre | Local (WASM) | OpenRouter |
| Coste | Gratis | Por página |
| Velocidad | ~2,5 s/página | Depende del modelo |
| Confidencialidad | Nada sale de la máquina | Las páginas se envían al proveedor |
| Confianza | La reporta (0–100) | No la reporta |
| Fuerte en | Texto limpio y ordenado | Tablas, sellos, manuscritos, escaneos malos |
| Riesgo propio | Confunde caracteres parecidos | Puede "completar" lo que no lee bien |

### Qué tan fiable es — medido

Comparando el OCR contra el texto original del mismo contrato:

| Escaneo | Confianza | Palabras exactas |
|---|---|---|
| Limpio | 93,9 % | **96,4 %** |
| Con ruido e inclinación (±0,3°) | 85,8 % | **80,7 %** |

Errores reales que produjo:

```
M/CTE            → MICTE
Ltda.            → Lida.
CONFID-2024-5519 → CONFID:2024-5519      (el guion se volvió dos puntos)
```

Ese último es el caso peligroso: en el escaneo degradado el mismo número de
contrato quedó escrito de **dos formas distintas dentro del mismo documento**
(5 fragmentos correctos, 4 con el error). Buscar el número exacto recupera solo
una parte de las ocurrencias.

Por eso el sistema hace tres cosas:

- **Marca** cada fragmento que viene de OCR (`ocr: true`) y lo muestra en la cita.
- **Avisa en el prompt**: los fragmentos OCR llevan `[texto obtenido por OCR]`, y
  el modelo tiene instrucción de advertir cuando una cifra o un nombre se apoya
  en uno de ellos, y de **nunca "corregir"** un dato que se lee raro.
- **Registra la confianza** y deja en el log las páginas por debajo de
  `OCR_MIN_CONFIDENCE`, para saber cuáles conviene revisar a mano.

> Guía completa —qué es el OCR, cómo se equivoca, los otros escenarios donde se
> usa y cuándo conviene evitarlo— en **[docs/OCR.md](docs/OCR.md)**.

### Probarlo

```bash
cd backend
npm run seed:scanned          # rasteriza 8 páginas -> PDF sin capa de texto
npm run seed:scanned:noise    # además lo degrada (ruido + inclinación)

curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@../seed-data/escaneados/01-arrendamiento-vivienda-escaneado.pdf"
```

También acepta imágenes sueltas (`.png`, `.jpg`, `.tiff`), que pasan siempre por
OCR, y `-F "ocr=false"` para desactivarlo en un archivo concreto.

---

## 7. Comandos útiles

```bash
# Base de datos
npm run db:up            # levanta Postgres          (desde backend/)
npm run db:psql          # consola psql
npm run db:reset         # borra el volumen y recrea el esquema
npm run db:resize-vector # cambia la dimensión de los vectores

# pgAdmin en http://localhost:5050
docker compose --profile tools up -d
```

Comprobar el estado de la indexación:

```sql
SELECT d.doc_type, COUNT(DISTINCT d.id) docs, COUNT(c.id) fragmentos
FROM documents d JOIN chunks c ON c.document_id = d.id
GROUP BY d.doc_type ORDER BY fragmentos DESC;
```

---

## 8. Ajustes de calidad

| Variable | Efecto |
|---|---|
| `CHUNK_SIZE` | Fragmentos grandes = más contexto, recuperación menos precisa |
| `CHUNK_OVERLAP` | Evita cortar una idea a la mitad |
| `RAG_TOP_K` | Más fragmentos = más contexto y más coste por consulta |
| `OPENROUTER_MODEL` | Cualquier modelo del catálogo de OpenRouter |
| `OCR_MODE` | `auto` (solo páginas sin texto), `force` (todas), `never` |
| `OCR_MIN_CHARS` | Umbral para considerar que una página "tiene texto" |
| `OCR_SCALE` | Más resolución = mejor lectura y más memoria/tiempo |
| `OCR_MIN_CONFIDENCE` | Por debajo, la página se reporta como dudosa |

Para evaluar el *retriever* sin gastar tokens del LLM, usa
`GET /api/rag/search`, o mira los pasos **08 a 10** del recorrido: muestran qué
fragmentos alimentarían la respuesta, con su puesto en cada buscador, su
puntuación, su cláusula y su página.

---

Los contratos de `seed-data/` son **documentos sintéticos de prueba**. No son
modelos contractuales válidos ni constituyen asesoría jurídica.
