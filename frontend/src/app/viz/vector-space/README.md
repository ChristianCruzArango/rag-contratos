# `viz/vector-space/` — El espacio de pgvector

Cada punto es un fragmento de la tabla `chunks`. La posición sale de proyectar
su embedding sobre los dos ejes en los que la nube más se estira — PCA sobre los
vectores reales, calculado en `backend/src/rag/projection.ts`.

**El color dice el tipo de contrato.** Sin eso el dibujo era una mancha: mil
puntos idénticos no cuentan nada. Con el color se ve lo único que este mapa
tiene que demostrar — que los fragmentos que hablan de lo mismo caen juntos sin
que nadie se lo haya dicho.

Dos honestidades que el componente respeta:

- **Los ejes no tienen unidad.** Un componente principal no es una magnitud, así
  que no hay marcas numéricas: sólo el porcentaje de información que conserva.
- **Los puntos recortados se dibujan huecos.** Los que caen fuera del encuadre se
  pegan al borde, y si se pintaran como los demás formarían una línea recta que
  parece un dato y no lo es. El pie dice cuántos son.
