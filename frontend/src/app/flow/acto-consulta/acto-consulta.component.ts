import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PipelineStore } from '../../core/pipeline/pipeline.store';
import { RagService } from '../../core/rag/rag.service';
import { PasoComponent } from '../../ui/paso/paso.component';
import { CifraComponent } from '../../ui/cifra/cifra.component';
import { VectorStripComponent } from '../../viz/vector-strip/vector-strip.component';
import { VectorSpaceComponent } from '../../viz/vector-space/vector-space.component';
import { CosineDialComponent } from '../../viz/cosine-dial/cosine-dial.component';
import { RrfFusionComponent } from '../../viz/rrf-fusion/rrf-fusion.component';
import type { EspacioVectorial } from '../../core/pipeline/pipeline.models';
import type { Trozo } from './acto-consulta.models';

/** Preguntas que se contestan bien con los contratos de prueba. */
const SUGERENCIAS = [
  '¿Cómo se reajusta el canon de arrendamiento?',
  '¿Qué plazo de preaviso hay para terminar el contrato?',
  '¿Qué obligaciones de confidencialidad asume el receptor?',
  '¿Cuál es la cláusula penal por incumplimiento?',
];

@Component({
  selector: 'app-acto-consulta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PasoComponent,
    CifraComponent,
    VectorStripComponent,
    VectorSpaceComponent,
    CosineDialComponent,
    RrfFusionComponent,
  ],
  templateUrl: './acto-consulta.component.html',
  styleUrls: ['../acto.scss', './acto-consulta.component.scss'],
})
export class ActoConsultaComponent {
  protected readonly sugerencias = SUGERENCIAS;
  protected readonly store = inject(PipelineStore);
  protected readonly pregunta = signal('');
  protected readonly espacio = signal<EspacioVectorial | null>(null);

  private readonly rag = inject(RagService);

  /** El mejor candidato del buscador vectorial: su coseno se dibuja. */
  protected readonly mejorVectorial = computed(() => this.store.vectorial()?.hits[0] ?? null);

  /**
   * La respuesta partida en trozos para poder resaltar los marcadores [n] y
   * enlazarlos con su fragmento de origen.
   */
  protected readonly trozos = computed<Trozo[]>(() => {
    const texto = this.store.respuesta();
    if (!texto) return [];

    const salida: Trozo[] = [];
    const re = /\[(\d{1,2})\]/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(texto)) !== null) {
      if (m.index > ultimo) {
        salida.push({ texto: texto.slice(ultimo, m.index), cita: null });
      }
      salida.push({ texto: m[0], cita: Number(m[1]) });
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) {
      salida.push({ texto: texto.slice(ultimo), cita: null });
    }
    return salida;
  });

  protected readonly citaResaltada = signal<number | null>(null);

  protected usar(sugerencia: string): void {
    this.pregunta.set(sugerencia);
    this.preguntar();
  }

  /** Lanza la consulta narrada y deja que el backend cuente cada paso. */
  protected preguntar(): void {
    const q = this.pregunta().trim();
    if (q.length < 3 || this.store.consultando()) return;

    this.store.reiniciarConsulta();
    this.store.consultando.set(true);
    this.espacio.set(null);

    this.rag.preguntarNarrado(q).subscribe({
      next: (evento) => {
        this.store.aplicar(evento);
        // En cuanto se sabe qué fragmentos ganaron, se pide el mapa con la
        // consulta ya situada dentro de la nube.
        if (evento.fase === 'fusion') this.dibujarEspacio(q);
      },
      error: (err: Error) => {
        this.store.error.set(err.message);
        this.store.consultando.set(false);
      },
      complete: () => this.store.consultando.set(false),
    });
  }

  private dibujarEspacio(q: string): void {
    this.rag.espacioVectorial({ q, muestra: 320 }).subscribe({
      next: (e) => this.espacio.set(e),
      error: () => this.espacio.set(null),
    });
  }
}
