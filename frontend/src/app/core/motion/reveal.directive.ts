import { Directive, ElementRef, DestroyRef, inject, input, afterNextRender } from '@angular/core';

/**
 * Revela un elemento cuando entra en pantalla.
 *
 * Con `IntersectionObserver`, nunca escuchando `scroll`: ese evento dispara
 * reflows continuos y hunde el rendimiento en móvil.
 */
@Directive({
  selector: '[revelar]',
  host: { '[attr.data-revelar]': '""' },
})
export class RevealDirective {
  /** Retardo en ms, para escalonar varios elementos hermanos. */
  readonly revelar = input<number | ''>('');

  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const nodo = this.el.nativeElement as HTMLElement;
      const retardo = Number(this.revelar()) || 0;

      const observador = new IntersectionObserver(
        (entradas) => {
          for (const entrada of entradas) {
            if (!entrada.isIntersecting) continue;
            nodo.style.transitionDelay = `${retardo}ms`;
            nodo.classList.add('visible');
            observador.unobserve(nodo);
          }
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
      );

      observador.observe(nodo);

      // Si por lo que sea el observador nunca dispara, el contenido aparece
      // solo: nada queda escondido para siempre por una animación.
      const rescate = setTimeout(() => nodo.classList.add('visible'), 4000);

      destroyRef.onDestroy(() => {
        observador.disconnect();
        clearTimeout(rescate);
      });
    });
  }
}
