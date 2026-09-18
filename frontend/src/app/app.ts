import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MargenComponent } from './shell/margen/margen.component';
import { prepararMovimiento } from './core/motion/motion';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, MargenComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    prepararMovimiento();
  }
}
