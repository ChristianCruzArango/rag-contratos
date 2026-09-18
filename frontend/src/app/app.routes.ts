import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'El recorrido de un contrato — RAG',
    loadComponent: () => import('./flow/flow-page/flow.page').then((m) => m.FlowPage),
  },
  { path: '**', redirectTo: '' },
];
