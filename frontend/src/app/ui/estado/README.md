# `ui/estado/` — En qué punto está algo

Una línea con cuatro signos: **reposo** (un punto), **trabajando** (una rueda
que gira), **listo** (un visto) y **fallo** (una exclamación).

Existe porque la página no distinguía entre «sigue trabajando», «terminó» y «se
rompió»: los tres se veían como un texto gris inmóvil. Con el backend caído
parecía que la aplicación estaba pensando.

El color refuerza el signo —violeta trabajando, verde listo, rojo fallo—, así
que con `prefers-reduced-motion` la rueda se queda quieta pero sigue leyéndose.
