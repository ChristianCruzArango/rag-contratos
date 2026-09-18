import type { Base2D, Punto2D } from './rag.types.js';
/**
 * Proyección de embeddings a 2D para poder verlos.
 *
 * Un embedding de `text-embedding-3-small` tiene 1536 dimensiones: nadie puede
 * dibujar eso. PCA busca los dos ejes en los que la nube de vectores más se
 * estira —los dos que más información conservan— y proyecta sobre ellos. Lo que
 * se ve en pantalla es una sombra fiel: dos fragmentos que salen juntos en el
 * dibujo estaban de verdad cerca en las 1536 dimensiones.
 *
 * Se resuelve por iteración de potencia sobre la matriz de covarianza (sin
 * construirla: se multiplica directamente por los datos), que para dos
 * componentes es más rápido y más corto que una SVD completa.
 */

/** Calcula los dos ejes principales de la nube. */
export function calcularBase(vectores: number[][]): Base2D {
  const n = vectores.length;
  const d = vectores[0].length;

  const media = new Float64Array(d);
  for (const v of vectores) for (let i = 0; i < d; i++) media[i] += v[i];
  for (let i = 0; i < d; i++) media[i] /= n;

  // Datos centrados: PCA mide dispersión respecto al centro de la nube.
  const centrados = vectores.map((v) => {
    const c = new Float64Array(d);
    for (let i = 0; i < d; i++) c[i] = v[i] - media[i];
    return c;
  });

  let total = 0;
  for (const c of centrados) for (let i = 0; i < d; i++) total += c[i] * c[i];

  const eje1 = componentePrincipal(centrados, d);
  const l1 = deflacionar(centrados, eje1, d);
  const eje2 = componentePrincipal(centrados, d);
  const l2 = energia(centrados, eje2, d);

  return {
    media,
    eje1,
    eje2,
    varianza: total > 0 ? [l1 / total, l2 / total] : [0, 0],
  };
}

/** Proyecta un vector sobre la base. */
export function proyectar(
  vector: number[] | Float64Array,
  base: Base2D,
): Punto2D {
  const d = base.media.length;
  let x = 0;
  let y = 0;
  for (let i = 0; i < d; i++) {
    const c = vector[i] - base.media[i];
    x += c * base.eje1[i];
    y += c * base.eje2[i];
  }
  return { x, y };
}

/** Similitud coseno entre dos vectores (1 = misma dirección). */
export function coseno(
  a: number[] | Float64Array,
  b: number[] | Float64Array,
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

/** Parsea el literal que pgvector devuelve como texto: '[0.1,0.2,…]'. */
export function parseVector(literal: string): number[] {
  return literal.slice(1, -1).split(',').map(Number);
}

// ── internos ────────────────────────────────────────────────────────────────

/** Iteración de potencia: el eje sobre el que la nube más se estira. */
function componentePrincipal(
  datos: Float64Array[],
  d: number,
  pasos = 24,
): Float64Array {
  let v = new Float64Array(d);
  // Semilla determinista: la misma nube da siempre el mismo dibujo.
  for (let i = 0; i < d; i++) v[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  normalizar(v);

  for (let paso = 0; paso < pasos; paso++) {
    const siguiente = new Float64Array(d);
    for (const x of datos) {
      let dot = 0;
      for (let i = 0; i < d; i++) dot += x[i] * v[i];
      for (let i = 0; i < d; i++) siguiente[i] += dot * x[i];
    }
    if (!normalizar(siguiente)) break;
    v = siguiente;
  }
  return v;
}

/** Quita de los datos la parte explicada por `eje` y devuelve su energía. */
function deflacionar(
  datos: Float64Array[],
  eje: Float64Array,
  d: number,
): number {
  let energiaEje = 0;
  for (const x of datos) {
    let dot = 0;
    for (let i = 0; i < d; i++) dot += x[i] * eje[i];
    energiaEje += dot * dot;
    for (let i = 0; i < d; i++) x[i] -= dot * eje[i];
  }
  return energiaEje;
}

function energia(datos: Float64Array[], eje: Float64Array, d: number): number {
  let e = 0;
  for (const x of datos) {
    let dot = 0;
    for (let i = 0; i < d; i++) dot += x[i] * eje[i];
    e += dot * dot;
  }
  return e;
}

function normalizar(v: Float64Array): boolean {
  let norma = 0;
  for (let i = 0; i < v.length; i++) norma += v[i] * v[i];
  norma = Math.sqrt(norma);
  if (norma < 1e-12) return false;
  for (let i = 0; i < v.length; i++) v[i] /= norma;
  return true;
}
