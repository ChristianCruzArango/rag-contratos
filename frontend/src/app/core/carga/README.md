# `core/carga/` — El estado de lo que se pide

Cuatro estados en vez de `T | null`: **reposo**, **cargando**, **listo**,
**fallo**.

Nació de un fallo real: los componentes guardaban el resultado en un signal que
valía `null` tanto si no se había pedido nada como si la petición había
reventado, y el `error:` del subscribe lo dejaba en `null` sin decir nada. Con
el backend caído, la página se quedaba enseñando «esperando…» indefinidamente y
parecía colgada, cuando en realidad estaba rota.

`pedir()` vuelca una petición en uno de estos signals y garantiza que el estado
avanza siempre: nunca se queda en silencio.
