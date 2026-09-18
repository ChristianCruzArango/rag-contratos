# `flow/flow-page/` — La página

Compone portada + los dos actos + archivo, y hace una sola cosa propia:
**acompañar el scroll**. Cuando el backend pasa a un paso nuevo, lleva al lector
hasta él.

Sólo al _cambiar_ de paso: durante la generación llegan cientos de eventos
`token` y arrastrar la vista con cada uno sería insoportable. El mapa de fase →
ancla vive aquí.
