# `viz/vector-strip/` — El embedding hecho visible

**El elemento firma de la pieza.** Cada barra es una dimensión del vector y su
altura es el valor real que devolvió el modelo: arriba si es positivo, abajo si
es negativo, siempre desde la misma línea del cero.

Se dibuja como barras y no como un degradado de colores porque un embedding es
una lista de números **con signo**, y eso se lee de un vistazo en un eje. Con
colores la tira parecía un código de barras y no se entendía qué era.

El color sale de tokens del tema (`--celda-mas`, `--celda-menos`), así que la
misma escala funciona sobre papel oscuro y sobre papel claro.
