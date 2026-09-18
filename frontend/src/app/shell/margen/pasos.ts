import type { Paso } from './margen.models';

/**
 * Los doce pasos del recorrido, numerados de corrido.
 *
 * La numeración no es adorno: el contenido ES una secuencia, y el número dice
 * en qué punto del camino está el documento. Es la misma convención con la que
 * un contrato numera sus cláusulas en el margen.
 */
export const PASOS: readonly Paso[] = [
  { id: 'recepcion', titulo: 'Llega el archivo', acto: 'ingesta', cumple: 'recepcion' },
  { id: 'extraccion', titulo: 'Se abre el PDF', acto: 'ingesta', cumple: 'extraccion' },
  { id: 'ocr', titulo: 'Lo que no se deja leer', acto: 'ingesta', cumple: 'ocr-plan' },
  { id: 'troceo', titulo: 'Se parte en fragmentos', acto: 'ingesta', cumple: 'troceo' },
  {
    id: 'embeddings',
    titulo: 'Cada fragmento, un vector',
    acto: 'ingesta',
    cumple: 'embeddings-lote',
  },
  { id: 'pgvector', titulo: 'Todo cae en pgvector', acto: 'ingesta', cumple: 'almacenado' },
  {
    id: 'pregunta',
    titulo: 'La pregunta se vuelve vector',
    acto: 'consulta',
    cumple: 'consulta-embedding',
  },
  {
    id: 'vectorial',
    titulo: 'Buscar por significado',
    acto: 'consulta',
    cumple: 'busqueda-vectorial',
  },
  {
    id: 'lexica',
    titulo: 'Buscar al pie de la letra',
    acto: 'consulta',
    cumple: 'busqueda-lexica',
  },
  { id: 'fusion', titulo: 'Juntar las dos listas', acto: 'consulta', cumple: 'fusion' },
  { id: 'prompt', titulo: 'Armar el prompt', acto: 'consulta', cumple: 'prompt' },
  { id: 'respuesta', titulo: 'OpenRouter responde', acto: 'consulta', cumple: 'respuesta-lista' },
];
