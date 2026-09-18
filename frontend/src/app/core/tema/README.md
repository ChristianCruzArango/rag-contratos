# `core/tema/` — Claro y oscuro

Escribe `data-tema` en `<html>` y lo recuerda en `localStorage`. Arranca en
claro.

Los dos temas comparten un juego de tokens en `src/styles.scss`. La regla que
los mantiene coherentes: **nada se escribe con un color fijo sobreimpreso** —
todo va como `rgb(var(--luz) / n%)`, y `--luz` se invierte con el tema.

Para que no haya un fogonazo del tema equivocado al arrancar, `index.html` lleva
un script mínimo que aplica el atributo antes de que Angular suba.
