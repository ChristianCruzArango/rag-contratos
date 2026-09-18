# `ocr/engines/` — Los dos motores

Implementaciones intercambiables del contrato `OcrEngine` de `../ocr.types.ts`.
Se elige con `OCR_ENGINE`; el servicio no sabe cuál tiene delante.

| | `tesseract.engine` | `vision.engine` |
|---|---|---|
| Dónde corre | Local (WASM) | OpenRouter |
| Coste | Gratis | Por página |
| Confidencialidad | Nada sale de la máquina | Las páginas se envían fuera |
| Confianza | La reporta (0–100) | No la reporta |
| Fuerte en | Texto limpio y ordenado | Tablas, sellos, manuscritos |
| Riesgo propio | Confunde caracteres parecidos | Puede «completar» lo que no lee bien |

Ese último riesgo es el motivo de que el motor por defecto sea el local: un
carácter mal leído se detecta; una frase inventada que encaja, no.
