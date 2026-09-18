# `ui/paso-estado/` — Un paso todavía sin datos

Tres motivos distintos para que un paso esté vacío, y antes se veían los tres
igual:

1. El recorrido **no ha empezado**.
2. Está **en marcha** y a este paso aún no le ha llegado el turno.
3. **Terminó y este paso no llegó a ocurrir.**

El tercero es el que engañaba. Pasa de verdad: si la búsqueda no encuentra
nada, el backend no llega a armar el prompt y nunca emite ese evento. El margen
decía «Respuesta lista · 5,6 s» mientras el paso 11 seguía diciendo «Esperando
a la fusión…».

Este componente lee el estado del recorrido y dice cuál de los tres es.
