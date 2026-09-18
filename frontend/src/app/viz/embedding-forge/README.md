# `viz/embedding-forge/` — Cómo se fabrica un embedding

Las cinco etapas entre el texto y la lista de números: prefijo `passage:`,
tokens, un vector por token, promedio (*mean pooling*) y escala a longitud 1.

La última importa más de lo que parece: normalizar es justo lo que hace que
después baste con medir el ángulo entre dos vectores. Este paso y la distancia
coseno del paso 08 se explican mutuamente.

Lo que muestra sale de datos medidos —el texto del fragmento, sus tokens
estimados, el modelo, el vector resultante—. El prefijo E5 se deduce del nombre
del modelo con la misma regla que aplica el backend.
