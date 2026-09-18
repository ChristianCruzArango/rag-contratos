import { extractText, getDocumentProxy } from 'unpdf';
import type { PdfContent } from './ingest.types.js';

/** Separador interno de página: el chunker lo usa para saber la página real. */
export const PAGE_BREAK = '\f';

/**
 * Extrae el texto de un PDF página por página y las une con PAGE_BREAK,
 * de forma que cada fragmento pueda citar la página exacta del documento.
 */
export async function extractPdf(
  buffer: Buffer | Uint8Array,
): Promise<PdfContent> {
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  let info: Record<string, unknown> = {};
  try {
    const meta = await pdf.getMetadata();
    info = (meta.info as Record<string, unknown>) ?? {};
  } catch {
    /* PDF sin metadatos */
  }

  const pageTexts = pages.map((p) => normalize(p));

  return {
    text: joinPages(pageTexts),
    pages: pageTexts.length,
    info,
    pageTexts,
  };
}

/** Une las páginas con el separador que el chunker usa para numerarlas. */
export function joinPages(pages: string[]): string {
  return pages.join(PAGE_BREAK);
}

/**
 * Limpia los artefactos típicos de la extracción: pies de página repetidos,
 * guiones de corte de línea y espacios sobrantes.
 */
function normalize(page: string): string {
  return page
    .replace(/^.*—\s*No\.\s*[A-ZÁÉÍÓÚÑ]+-\d{4}-\d+\s*$/gm, '') // encabezado del pie
    .replace(/^Página \d+ de \d+\s*$/gm, '') // numeración del pie
    .replace(/(\w)-\n(\w)/g, '$1$2') // palabra cortada
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
