# `src/app` — El recorrido

Aplicación Angular 22 (standalone + signals, sin zonas) que enseña el pipeline
RAG del backend **ejecutándose de verdad**: no hay tiempos simulados ni cifras
de maqueta. El backend emite un evento por cada paso mientras trabaja y la
interfaz anima eso.

## Cómo se agrupa

Una carpeta por componente, con su `.ts`, su `.html`, su `.scss`, sus modelos y
su `README.md`. Las agrupaciones de nivel superior son por **capacidad**, no por
tipo de archivo:

| Carpeta | De qué responde |
|---|---|
| `core/` | Lo que no se ve: datos, estado, movimiento y tema. Nadie de aquí importa un componente. |
| `shell/` | El armazón permanente de la página: el margen numerado. |
| `ui/` | Piezas de composición sin conocimiento del dominio: la banda de un paso, una cifra. |
| `viz/` | Los dibujos. Cada uno recibe datos por `input()` y no habla con ningún servicio. |
| `flow/` | Las páginas y los dos actos: es quien orquesta a todos los demás. |

## Regla de dependencias

```
flow ──▶ ui ──▶ core
  │       │
  └──▶ viz ──▶ core
        │
shell ──┴──▶ core
```

Las flechas van sólo en ese sentido. `core/` no importa nada de arriba, y `viz/`
no importa de `flow/`: un dibujo debe poder usarse en cualquier sitio.
