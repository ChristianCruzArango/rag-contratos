import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import gsap from 'gsap';

/**
 * Configuración única de GSAP para toda la app.
 *
 * Tres curvas propias, con nombres de lo que hacen. Ninguna animación usa
 * `linear` ni `ease-in-out`: todo movimiento aquí simula masa.
 *
 *   tinta   — algo que se posa y se queda; salida larga, sin rebote
 *   pliego  — una hoja que se desliza y frena de golpe al final
 *   sello   — impacto seco con un punto de sobrepaso, para confirmaciones
 */
let listo = false;

export function prepararMovimiento(): void {
  if (listo) return;
  listo = true;

  gsap.registerPlugin(CustomEase, ScrollTrigger, DrawSVGPlugin);

  // Marca que el movimiento está activo: hasta aquí, nada se esconde.
  document.documentElement.classList.add('con-movimiento');

  CustomEase.create('tinta', 'M0,0 C0.32,0.72 0,1 1,1');
  CustomEase.create('pliego', 'M0,0 C0.16,1 0.3,1 1,1');
  CustomEase.create('sello', 'M0,0 C0.34,1.56 0.64,1 1,1');

  gsap.defaults({ ease: 'tinta', duration: 0.8 });

  // Si el sistema pide menos movimiento, todo ocurre igual pero instantáneo:
  // la información nunca depende de ver la animación.
  gsap.ticker.lagSmoothing(500, 33);
}

/** ¿El sistema pide reducir el movimiento? */
export function movimientoReducido(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Contexto GSAP acotado a un elemento. Devuelve la función de limpieza que hay
 * que llamar en `DestroyRef`: revierte tweens y ScrollTriggers creados dentro.
 */
export function enContexto(raiz: Element, construir: (ctx: gsap.Context) => void): () => void {
  const ctx = gsap.context((self) => construir(self), raiz);
  return () => ctx.revert();
}

/** Interpola un número hacia otro, para contadores. */
export function contarHasta(
  destino: { valor: number },
  hasta: number,
  onUpdate: (v: number) => void,
  duracion = 1.1,
): gsap.core.Tween {
  return gsap.to(destino, {
    valor: hasta,
    duration: movimientoReducido() ? 0 : duracion,
    ease: 'tinta',
    onUpdate: () => onUpdate(destino.valor),
  });
}

export { gsap, ScrollTrigger };
