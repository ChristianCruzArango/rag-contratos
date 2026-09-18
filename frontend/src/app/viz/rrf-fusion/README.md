# `viz/rrf-fusion/` — La fusión de las dos listas

Los dos buscadores devuelven puntuaciones que no se pueden sumar: una es un
coseno, la otra un `ts_rank_cd`. **Reciprocal Rank Fusion** lo resuelve
ignorándolas y mirando sólo los puestos: cada lista aporta `1 / (k + puesto)`.

La barra de cada fila es esa suma, partida por origen — violeta lo que aportó la
búsqueda semántica, verde lo que aportó la literal. Una fila con las dos mitades
es una que salió bien colocada en ambas listas, y por eso está arriba.
