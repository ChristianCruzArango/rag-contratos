# `core/pipeline/` — Lo que el backend va contando

Espejo del contrato de `backend/src/pipeline/pipeline.types.ts`. **Si cambia
allí, hay que cambiarlo aquí**: es el único punto de acoplamiento fuerte entre
los dos lados.

- `pipeline.models.ts` — la unión discriminada `PipelineEvent`, con una variante
  por paso. El campo `fase` es el discriminante.
- `pipeline.store.ts` — recibe esos eventos y los convierte en signals. No
  calcula nada que el backend no haya medido: si una cifra aparece en pantalla,
  salió de un evento.

El orden de los doce pasos vive en `shell/margen/pasos.ts`, no aquí.
