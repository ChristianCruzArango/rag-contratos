# OCR — guía de referencia

Todo lo relativo al reconocimiento óptico de caracteres en este proyecto: qué es,
por qué hizo falta, cómo está implementado, qué tan fiable es y en qué otros
escenarios se usa.

- [1. Qué es OCR y por qué un documento aparece vacío](#1-qué-es-ocr-y-por-qué-un-documento-aparece-vacío)
- [2. Por qué importa tanto en un RAG](#2-por-qué-importa-tanto-en-un-rag)
- [3. Qué tan fiable es — mediciones reales](#3-qué-tan-fiable-es--mediciones-reales)
- [4. Cómo está implementado aquí](#4-cómo-está-implementado-aquí)
- [5. Los dos motores](#5-los-dos-motores)
- [6. Configuración](#6-configuración)
- [7. Cómo probarlo](#7-cómo-probarlo)
- [8. Otros usos del OCR](#8-otros-usos-del-ocr)
- [9. Variantes técnicas](#9-variantes-técnicas)
- [10. Cuándo NO usar OCR](#10-cuándo-no-usar-ocr)
- [11. Diagnóstico de problemas](#11-diagnóstico-de-problemas)

---

## 1. Qué es OCR y por qué un documento aparece vacío

Un PDF puede ser dos cosas completamente distintas, aunque en pantalla se vean
idénticas:

| | PDF nativo | PDF escaneado |
|---|---|---|
| Cómo nació | Exportado desde Word, un sistema, etc. | Fotografiado o pasado por el escáner |
| Qué contiene por dentro | Caracteres reales | Una **imagen** de la página |
| Texto extraíble | Sí | **Ninguno** |
| Se puede buscar / copiar | Sí | No |

Un humano abre los dos y lee igual: sus ojos interpretan las letras. Pero el
programa no tiene ojos. Abre el archivo, busca caracteres y en el escaneado
encuentra **una foto**. No hay nada que extraer.

Por eso el documento "aparece vacío". Comprobado con los archivos de este
repositorio:

```
01-arrendamiento-vivienda.pdf              100 páginas   chars/pág: 483, 3108, 3394, 3161…
01-arrendamiento-vivienda-escaneado.pdf      8 páginas   chars/pág: 0, 0, 0, 0, 0, 0, 0, 0
```

**OCR** (*Optical Character Recognition*, reconocimiento óptico de caracteres) es
la tecnología que resuelve eso: analiza la forma de cada mancha de tinta de la
imagen y decide qué carácter es. Convierte la foto en texto buscable.

---

## 2. Por qué importa tanto en un RAG

Sin OCR, un contrato escaneado se indexa con **0 fragmentos**. El efecto es el
peor posible porque **falla en silencio**:

1. El usuario sube el contrato.
2. Lo ve listado en «Documentos», aparentemente cargado.
3. Pregunta por una cláusula.
4. El modelo responde *«No encuentro esa información en los documentos
   indexados»* — sobre un contrato que sí está ahí.

No hay error, no hay excepción, no hay log rojo. Solo un documento invisible.

### El OCR es la puerta de entrada de todo el pipeline

```
PDF escaneado → [OCR] → texto → chunks → embeddings → búsqueda → contexto → LLM → respuesta
                  ▲
                  └── si aquí se lee mal, el error viaja intacto hasta el final
```

El texto que produce el OCR es el que se trocea, el que se vectoriza, el que se
busca y el que se le entrega al modelo como contexto. **El modelo no tiene forma
de saber que lo que está leyendo tiene erratas: lo dará por cierto.**

El daño se reparte en cuatro frentes:

| Dónde golpea | Qué pasa |
|---|---|
| **Búsqueda léxica** | Es la que acierta con cifras, NIT y números de cláusula. Un guion cambiado la rompe: el término deja de coincidir. |
| **Embeddings** | Toleran mejor las erratas porque captan el sentido general, pero un fragmento lleno de basura genera un vector ruidoso que no se parece a nada. |
| **La respuesta** | Si el modelo cita «el contrato MICTE por $65.179.000», el dato está mal y suena igual de convincente que uno correcto. |
| **La confianza** | Es lo más difícil de reparar. Una cifra mal citada una vez hace que se dude de todas las demás. |

---

## 3. Qué tan fiable es — mediciones reales

Medido en este proyecto comparando el resultado del OCR contra el texto original
del mismo contrato (8 páginas):

| Escaneo | Confianza reportada | Palabras exactas |
|---|---|---|
| Limpio | 93,9 % | **96,4 %** |
| Con ruido e inclinación de ±0,3° | 85,8 % | **80,7 %** |

Una inclinación que a simple vista ni se nota tira la precisión **16 puntos**.

### Errores concretos que produjo

```
M/CTE             →  MICTE
Ltda.             →  Lida.
CONFID-2024-5519  →  CONFID:2024-5519     ← el guion se volvió dos puntos
```

### El caso realmente peligroso

En el escaneo degradado, el mismo número de contrato quedó escrito **de dos
formas distintas dentro del mismo documento**:

```
5 fragmentos con  CONFID-2024-5519   (correcto)
4 fragmentos con  CONFID:2024-5519   (mal leído)
```

Quien busque el número exacto recupera **solo una parte** de las ocurrencias, y
no recibe ninguna señal de que le falta la otra mitad. El error del OCR no suele
ser total y evidente: es **parcial e intermitente**, que es mucho peor de
detectar.

### Riesgo adicional del motor de visión

Un modelo multimodal es *generativo*. Ante una palabra borrosa tiende a
**completar lo que «debería» decir** en vez de admitir que no la lee.

- Un error de Tesseract se ve raro (`Lida.`) y salta a la vista.
- Una invención de un modelo de visión se lee perfecta y es **indetectable**.

Por eso el prompt del motor `vision` le prohíbe expresamente completar y le
obliga a escribir `[ilegible]`.

---

## 4. Cómo está implementado aquí

### Archivos

```
backend/src/ocr/
├── ocr.types.ts         Interfaces OcrEngine / OcrPageResult / OcrReport
├── tesseract.engine.ts  Motor local (WASM)
├── vision.engine.ts     Motor multimodal vía OpenRouter
├── ocr.service.ts       Orquestación: detección, rasterizado, concurrencia
└── ocr.module.ts

backend/scripts/make-scanned.mjs   Genera PDFs escaneados de prueba
```

### Flujo en modo `auto` (por defecto)

1. Se extrae la capa de texto del PDF, **página por página**.
2. Se marcan como «sin texto» las páginas que no llegan a `OCR_MIN_CHARS` (120).
3. **Solo esas** se rasterizan a imagen (`unpdf` + `@napi-rs/canvas`).
4. Cada imagen pasa por el motor de OCR.
5. El texto reconocido se inserta en el lugar de esa página.
6. El resultado se trocea igual que cualquier otro documento.

Así un PDF nativo no paga OCR, y un escaneo lo paga solo en las páginas que lo
necesitan. Medido en esta máquina:

| Archivo | Páginas | ¿OCR? | Tiempo de indexación |
|---|---|---|---|
| `09-suministro-mercantil.pdf` (nativo) | 99 | no | **1,9 s** |
| `01-…-escaneado.pdf` | 8 | sí | **13,1 s** |

### Las tres protecciones

Como el OCR puede equivocarse, el sistema no finge que su salida es perfecta:

**1. Marca el origen.** Cada fragmento que viene de OCR lleva `ocr: true` en su
metadata, y la interfaz muestra una etiqueta ámbar **OCR** en la cita.

**2. Se lo advierte al modelo.** Esos fragmentos llegan al prompt con la marca
`[texto obtenido por OCR]`, y la instrucción del sistema dice:

> Los fragmentos marcados con «[texto obtenido por OCR]» provienen de un
> documento escaneado y pueden tener errores de lectura. Si basas en uno de ellos
> una cifra, una fecha o un nombre propio, advierte al usuario que conviene
> verificarlo contra el documento original. Nunca «corrijas» un dato que se lee
> mal: transcríbelo tal cual y señala la duda.

**3. Registra la confianza.** Cada documento guarda un informe en su metadata:

```json
{
  "modo": "auto",
  "motor": "tesseract",
  "aplicado": true,
  "duracion_ms": 13051,
  "paginas_ocr": [1, 2, 3, 4, 5, 6, 7, 8],
  "confianza_media": 93.9,
  "paginas_totales": 8,
  "paginas_baja_confianza": [],
  "omitidas_por_limite": 0
}
```

Las páginas por debajo de `OCR_MIN_CONFIDENCE` quedan en el log para revisarlas
a mano.

---

## 5. Los dos motores

| | `tesseract` (por defecto) | `vision` |
|---|---|---|
| Dónde corre | Local, WebAssembly | OpenRouter |
| Coste | Gratis | Por página |
| Velocidad | ~2,5 s/página | Depende del modelo |
| Confidencialidad | **Nada sale de la máquina** | Las páginas se envían al proveedor |
| Reporta confianza | Sí (0–100) | No |
| Fuerte en | Texto impreso limpio y ordenado | Tablas, sellos, manuscritos, escaneos malos |
| Riesgo propio | Confunde caracteres parecidos | Puede «completar» lo que no lee bien |

**Criterio práctico:** empieza con `tesseract`. Cambia a `vision` solo si los
documentos traen tablas complejas, sellos, firmas manuscritas o escaneos
realmente malos — y siempre que la confidencialidad del documento permita
enviarlo a un tercero.

---

## 6. Configuración

Variables en el `.env` de la raíz:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `OCR_ENABLED` | `true` | Interruptor general |
| `OCR_MODE` | `auto` | `auto` = solo páginas sin texto · `force` = todas · `never` = desactivado |
| `OCR_ENGINE` | `tesseract` | `tesseract` o `vision` |
| `OCR_LANGS` | `spa` | Idiomas de Tesseract (`spa+eng` para mezclados) |
| `OCR_MIN_CHARS` | `120` | Caracteres mínimos para considerar que una página «tiene texto» |
| `OCR_SCALE` | `2` | Resolución del rasterizado. Más = mejor lectura, más memoria y tiempo |
| `OCR_CONCURRENCY` | `2` | Páginas en paralelo |
| `OCR_MIN_CONFIDENCE` | `60` | Por debajo, la página se reporta como dudosa |
| `OCR_MAX_PAGES` | `50` | Tope de páginas por documento, como freno de coste |
| `OCR_VISION_MODEL` | `google/gemini-2.5-flash` | Modelo multimodal del motor `vision` |

### Cuándo usar `force`

El modo `force` ignora la capa de texto y rehace todas las páginas. Sirve cuando
el PDF **ya trae un OCR previo de mala calidad**: tiene texto, así que el modo
`auto` no lo tocaría, pero ese texto es basura. Es el único caso donde conviene.

---

## 7. Cómo probarlo

```bash
cd backend

# Genera un PDF escaneado a partir de uno nativo (rasteriza 8 páginas)
npm run seed:scanned

# Igual, pero además lo degrada: ruido, gris e inclinación
npm run seed:scanned:noise

# Con otro documento o más páginas
node scripts/make-scanned.mjs --pages 12 --src ../seed-data/05-servicios-juridicos.pdf --noise
```

Subirlo:

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@../seed-data/escaneados/01-arrendamiento-vivienda-escaneado.pdf" \
  -F "docType=arrendamiento"
```

También acepta **imágenes sueltas** (`.png`, `.jpg`, `.tiff`), que siempre pasan
por OCR, y `-F "ocr=false"` para desactivarlo en un archivo concreto.

Verificar qué se reconoció:

```sql
-- Informe de OCR por documento
SELECT source,
       metadata->'ocr'->>'motor'           AS motor,
       metadata->'ocr'->>'confianza_media' AS confianza,
       jsonb_array_length(metadata->'ocr'->'paginas_ocr') AS paginas
FROM documents
WHERE metadata->'ocr'->>'aplicado' = 'true';

-- Fragmentos que provienen de OCR
SELECT metadata->>'pagina' AS pag, LEFT(content, 120)
FROM chunks WHERE metadata->>'ocr' = 'true' LIMIT 10;
```

---

## 8. Otros usos del OCR

El caso de este proyecto —rescatar un documento que de otro modo sería
invisible— es solo uno de cuatro patrones, y los otros tres se diseñan distinto.

### Patrón 1 · Extraer campos concretos, no el documento entero

No quieres el texto completo: quieres seis datos y llevarlos a una tabla. El OCR
es el primer paso; detrás va una capa de *parsing* y validación.

- **Facturas y recibos.** NIT, fecha, subtotal, IVA, total, CUFE. Lo valioso no
  es el texto sino que los números cuadren.
- **Documentos de identidad (KYC).** Cédula, pasaporte, licencia. Los pasaportes
  traen una **MRZ** (las dos líneas de `<<<` al pie) diseñada para lectura
  automática, **con dígitos de verificación**: si el checksum cuadra, el dato es
  fiable casi con certeza.
- **Extractos bancarios.** Convertir el PDF del banco en movimientos
  estructurados.
- **Recetas y resultados de laboratorio.** Digitalizar la orden en papel hacia la
  historia clínica.

> **Clave de este patrón:** casi siempre existe una forma de *verificar* el
> resultado — un total que suma, un checksum, un NIT que existe en un registro.
> Eso es lo que convierte un OCR del 85 % en un dato confiable. Úsala siempre que
> esté disponible.

### Patrón 2 · Leer el mundo real por cámara

Texto torcido, con reflejos, mala luz, en perspectiva. Técnicamente es *scene
text recognition* y es bastante más difícil que leer un folio plano.

- **Placas de vehículos (ANPR).** Parqueaderos, peajes, control de acceso,
  fotodetección. Suele combinarse con detección de objetos: primero se localiza
  la placa, después se lee.
- **Logística.** Números de contenedor (norma ISO 6346, también con dígito de
  verificación), guías, etiquetas, manifiestos de carga.
- **Retail e inventario.** Precios de estantería, fechas de vencimiento y lotes
  recorriendo el pasillo con el celular.
- **Industrial.** Números de serie grabados o estampados en metal, códigos DOT en
  llantas. No hay contraste de tinta sobre papel: es relieve, y exige
  iluminación específica.
- **Traducción en vivo.** Apuntar la cámara a un menú o una señal y ver la
  traducción superpuesta.
- **Accesibilidad.** Una persona con discapacidad visual apunta el teléfono a un
  envase o a un letrero y el dispositivo se lo lee en voz alta.

### Patrón 3 · Leer pantallas (cuando no hay API)

- **Automatización de sistemas legacy (RPA).** Un sistema viejo sin API ni acceso
  a la base: el bot mira la pantalla, lee los campos y actúa. Frágil, y a veces
  la única opción.
- **Agentes que operan el computador.** Un modelo que maneja una interfaz gráfica
  necesita leer lo que hay en pantalla para decidir dónde hacer clic.
- **QA y testing visual.** Verificar que cierto texto aparece renderizado, útil
  en móviles o videojuegos donde no hay DOM que inspeccionar.
- **Moderación de contenido.** Detectar texto dentro de imágenes: el spam, el
  phishing y el discurso de odio se meten en un meme precisamente para esquivar
  los filtros que solo miran texto.
- **Forense digital.** Indexar miles de capturas de pantalla para poder buscar
  dentro de ellas.

### Patrón 4 · Digitalización masiva de archivos

Parecido a este proyecto pero a otra escala y con otro objetivo: no responder
preguntas, sino **hacer buscable un acervo completo**.

- **Archivos judiciales y notariales.** En Colombia hay expedientes enteros
  escaneados en PDF. Hacerlos buscables por número de radicado cambia el trabajo
  de quien los consulta.
- **Bibliotecas y prensa histórica.** Periódicos de hace un siglo, con
  tipografías raras y papel amarillento.
- **Manuscritos.** Ya no es OCR sino **HTR**, un problema distinto: no hay formas
  de carácter estables, y los modelos se entrenan por escribano o por época.
- **E-discovery legal.** Indexar millones de documentos en un litigio para
  encontrar los relevantes. Una de las aplicaciones comerciales más antiguas del
  OCR.

### Extensiones naturales para este proyecto

Con la infraestructura ya montada:

- **Leer cédulas para prellenar contratos.** El usuario sube la foto y se
  autocompletan nombre, número y ciudad en la comparecencia. Reutiliza
  `OcrService.recognizeImage()` tal cual.
- **Sentencias y expedientes judiciales.** Mismo pipeline, otro `docType`. Ahí el
  OCR es obligatorio porque casi todo llega escaneado.
- **Módulo de facturas.** Cambiando el chunker por un extractor de campos, la
  misma base de PostgreSQL sirve para conciliación contable.

---

## 9. Variantes técnicas

No todo lo que parece OCR es el mismo problema:

| Sigla | Qué lee | Ejemplo típico |
|---|---|---|
| **OCR** | Texto impreso | Este proyecto |
| **ICR** | Manuscrito de imprenta | Formularios llenados a mano |
| **HTR** | Manuscrito corrido | Cartas, actas antiguas |
| **OMR** | Marcas, no letras | Exámenes de burbujas, votos, encuestas |
| **MRZ** | Zona codificada | Pasaportes, visas |
| **Fórmulas** | Matemáticas → LaTeX | Apuntes, artículos científicos |
| **Tablas** | Estructura, no solo texto | Recuperar filas y columnas, no un párrafo revuelto |

El **OMR** es el más subestimado: si solo necesitas saber qué casilla está
marcada, no hace falta reconocer ni una letra. Es muchísimo más rápido y preciso
que un OCR completo.

---

## 10. Cuándo NO usar OCR

Vale tanto como saber cuándo sí:

| Situación | Qué hacer en su lugar |
|---|---|
| **El PDF es nativo** | Extraer la capa de texto: más rápido y **100 % exacto**. El modo `auto` ya hace esta distinción solo. |
| **Hay código de barras o QR** | Leerlo. Un QR trae corrección de errores incorporada; el OCR no. |
| **Existe una API** | Usarla. El OCR sobre una pantalla es siempre el último recurso. |
| **El documento lo genera tu propio sistema** | Guardar los datos estructurados de una vez. Escanear después lo que tú mismo imprimiste es perder información gratis. |

---

## 11. Diagnóstico de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El documento se indexa con 0 fragmentos | OCR desactivado o PDF de solo imagen | Revisar `OCR_ENABLED` y `OCR_MODE` |
| Confianza muy baja (< 60) | Escaneo torcido, con poca luz o baja resolución | Subir `OCR_SCALE` a 3, o cambiar a motor `vision` |
| Tarda demasiado | Muchas páginas escaneadas | Subir `OCR_CONCURRENCY`, bajar `OCR_SCALE`, ajustar `OCR_MAX_PAGES` |
| Tildes o «ñ» mal leídas | Idioma incorrecto | Verificar `OCR_LANGS=spa` (no `eng`) |
| Texto presente pero ilegible | OCR previo de mala calidad en el PDF | `OCR_MODE=force` |
| Falla la primera ejecución | Descarga del modelo de idioma (~11 MB) | Comprobar conexión; se cachea en `OCR_CACHE_PATH` |
| Se queda sin memoria | Páginas rasterizadas muy grandes | Bajar `OCR_SCALE` y `OCR_CONCURRENCY` |

---

## Resumen en cinco líneas

1. Un PDF escaneado es **una foto**: sin OCR entra al índice vacío y falla en silencio.
2. El OCR es **la puerta de entrada**: lo que lee mal ahí, el LLM lo repite como cierto.
3. Es bueno pero no perfecto: **96 %** con un escaneo limpio, **81 %** con uno degradado.
4. Por eso todo fragmento de OCR va **marcado**, el modelo va **advertido** y la confianza queda **registrada**.
5. Si el PDF es nativo, **no lo uses**: extraer el texto es más rápido y exacto.
