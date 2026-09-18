# `shell/margen/` — El margen numerado

**El elemento firma de la pieza.** Un contrato numera sus cláusulas en el margen
para que cualquiera pueda señalar un punto exacto del texto; esta columna hace
lo mismo con el recorrido del documento.

No es una barra de progreso decorativa: cada paso se marca como cumplido cuando
el `PipelineStore` recibe el evento que lo confirma. Además hace de índice
navegable y de *scroll spy*.

- `pasos.ts` — los doce pasos, en orden, con la fase del backend que da cada uno
  por cumplido. **Es la fuente de verdad del orden del recorrido**: si se añade
  un paso, se añade aquí.
- `margen.models.ts` — la forma de un paso.

En móvil se acuesta: pasa a ser una tira superior con sólo los números.
