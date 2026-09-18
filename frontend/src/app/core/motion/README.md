# `core/motion/` — El movimiento

- `motion.ts` — registra GSAP una sola vez y define las tres curvas propias:
  `tinta` (se posa y se queda), `pliego` (desliza y frena) y `sello` (impacto
  con sobrepaso). Ninguna animación usa `linear` ni `ease-in-out`.
- `reveal.directive.ts` — revela un elemento al entrar en pantalla con
  `IntersectionObserver`, nunca escuchando `scroll`.

**Degradación:** el CSS sólo esconde lo que va a revelarse si `motion.ts` llegó
a ejecutarse (marca `.con-movimiento` en `<html>`), y la directiva tiene un
temporizador de rescate. Un texto invisible por una animación rota es peor que
un texto que aparece sin gracia.
