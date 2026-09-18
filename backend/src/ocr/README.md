# `ocr/` — Lo que no se deja leer

Un PDF escaneado es una foto: al pedirle el texto devuelve cadena vacía, y sin
este paso entraría al índice con cero fragmentos.

En modo `auto` sólo se rasterizan y reconocen las páginas que no llegan a
`OCR_MIN_CHARS`. Un PDF nativo no paga nada; un escaneo paga sólo donde hace
falta.

- `ocr.types.ts` — el contrato `OcrEngine` que comparten las implementaciones.
- `engines/` — las dos implementaciones, intercambiables por configuración:
  `tesseract` (local, gratis, reporta confianza) y `vision` (un modelo
  multimodal vía OpenRouter, mejor con tablas y sellos, no reporta confianza).

Cada fragmento que sale de aquí queda marcado con `ocr: true`, el prompt avisa
al modelo de que puede estar mal leído y la cita lo dice. **Nunca se corrige un
dato que se lee raro**: eso sería inventarlo.
