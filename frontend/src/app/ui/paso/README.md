# `ui/paso/` — Una banda del recorrido

**No es una tarjeta**: no hay caja, ni sombra, ni fondo propio. Lo único que
separa un paso del siguiente es un hilo de luz y mucho aire, como en un
documento impreso.

Dos columnas. La izquierda queda fija mientras se lee (`position: sticky`) y
lleva el número, el título y **toda la explicación** del paso. La derecha lleva
sólo los datos que el backend está midiendo.

Ese reparto es la regla de toda la pieza: *explicación a la izquierda, medición
a la derecha*. Antes había apartes de texto intercalados entre los datos y
obligaban a saltar de una columna a otra para seguir un mismo hilo.

Proyecta el contenido con dos ranuras: `[entrada]` para la explicación y la
ranura por defecto para el cuerpo.
