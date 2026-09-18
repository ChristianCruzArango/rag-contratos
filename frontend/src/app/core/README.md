# `core/` — Lo que no se dibuja

Datos, estado, movimiento y tema. Todo lo de aquí es inyectable o importable
desde cualquier parte, y **nada de aquí conoce un componente**.

| Carpeta | De qué responde |
|---|---|
| `rag/` | La única puerta a la API del backend. |
| `pipeline/` | El contrato de eventos del backend y el estado que forman al llegar. |
| `motion/` | Configuración de GSAP y el revelado al entrar en pantalla. |
| `tema/` | Tema claro/oscuro, recordado en `localStorage`. |
