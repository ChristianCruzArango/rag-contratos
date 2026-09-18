/** Tipos de la conversación con el modelo. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
