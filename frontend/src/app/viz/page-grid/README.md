# `viz/page-grid/` — Las páginas del PDF

Cada hoja dibuja tantas rayas como texto se le pudo sacar. Una hoja en ámbar y
vacía es una página que el programa no sabe leer: existe, se ve en un visor,
pero para el índice está en blanco.

Es el dibujo que hace visible el problema que resuelve el OCR, y luego lo ve
resolverse: las páginas en cola llevan una línea de escáner, y al llegar su
resultado se rellenan.
