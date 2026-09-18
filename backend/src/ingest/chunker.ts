import { PAGE_BREAK } from './pdf.js';
import type { Chunk, Section } from './ingest.types.js';

/**
 * Trocea texto legal respetando su estructura.
 *
 * Divide primero por cláusula / anexo (los contratos generados usan
 * "CLÁUSULA <ORDINAL>." y "ANEXO <n>.") y luego por párrafo, de modo que un
 * fragmento no mezcle dos cláusulas distintas. Cada chunk conserva en su
 * metadata la cláusula y la página de origen para poder citarlas.
 */
export function chunkText(
  text: string,
  opts: { chunkSize: number; overlap: number; ocrPages?: number[] },
): Chunk[] {
  const { chunkSize, overlap } = opts;
  const ocrPages = new Set(opts.ocrPages ?? []);
  const secciones = splitSections(text);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const sec of secciones) {
    const paginaBase = pageOf(text, sec.offset);
    let saltosPrevios = 0;
    for (const piece of splitBySize(sec.content, chunkSize, overlap)) {
      const content = piece.replace(/\f/g, '\n\n').trim();
      const paginaChunk = paginaBase + saltosPrevios;
      saltosPrevios += (piece.match(/\f/g) ?? []).length;
      if (content.length < 40) continue;
      chunks.push({
        index: index++,
        content: sec.heading ? `${sec.heading}\n\n${content}` : content,
        metadata: {
          seccion: sec.heading ?? null,
          tipo_seccion: sec.kind,
          pagina: paginaChunk,
          // Marca el texto reconocido por OCR: puede contener errores de
          // lectura, y conviene que la cita lo advierta.
          ocr: ocrPages.has(paginaChunk),
        },
      });
    }
  }

  return chunks;
}

function splitSections(text: string): Section[] {
  // Sólo títulos reales: "CLÁUSULA <ORDINAL EN MAYÚSCULAS>." o "ANEXO <n>.",
  // en su propia línea. Sin `i`, para no capturar menciones como
  // "…conforme a la Cláusula de Supervisión." dentro de un párrafo.
  const re =
    /^(CLÁUSULA\s+[A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*\.[^\n]*|ANEXO\s+\d+\.[^\n]*)$/gm;
  const marks: { heading: string; kind: Section['kind']; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    marks.push({
      heading: m[1].trim(),
      kind: m[1].toUpperCase().startsWith('ANEXO') ? 'anexo' : 'clausula',
      start: m.index,
    });
  }

  if (marks.length === 0) {
    return [{ heading: null, kind: 'preambulo', content: text, offset: 0 }];
  }

  const out: Section[] = [
    {
      heading: null,
      kind: 'preambulo',
      content: text.slice(0, marks[0].start),
      offset: 0,
    },
  ];
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    out.push({
      heading: mark.heading,
      kind: mark.kind,
      content: text.slice(mark.start + mark.heading.length, end),
      offset: mark.start,
    });
  });
  return out.filter((s) => s.content.trim().length > 0);
}

/** Corta por párrafos, acumulando hasta chunkSize y solapando `overlap`. */
function splitBySize(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const out: string[] = [];
  let buf = '';

  for (const p of paragraphs) {
    // Un párrafo más largo que el chunk se parte por frases.
    if (p.length > chunkSize) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(...hardSplit(p, chunkSize, overlap));
      continue;
    }
    if ((buf + '\n\n' + p).length > chunkSize && buf) {
      out.push(buf);
      buf = overlap > 0 ? tail(buf, overlap) + '\n\n' + p : p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function hardSplit(text: string, size: number, overlap: number): string[] {
  const sentences = text.split(/(?<=[.;:])\s+/);
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).length > size && buf) {
      out.push(buf);
      buf = overlap > 0 ? tail(buf, overlap) + ' ' + s : s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** Cola de `text` de ~`size` caracteres, cortada en frontera de palabra. */
function tail(text: string, size: number): string {
  if (text.length <= size) return text;
  const slice = text.slice(-size);
  const space = slice.search(/\s/);
  return space === -1 ? slice : slice.slice(space + 1);
}

/**
 * Página de origen de una posición del texto.
 * En PDFs se cuentan los saltos de página insertados por `extractPdf`;
 * en texto plano se busca la última marca "[Página N]".
 */
function pageOf(text: string, offset: number): number {
  const before = text.slice(0, offset);
  if (text.includes(PAGE_BREAK)) {
    return before.split(PAGE_BREAK).length;
  }
  const matches = before.match(/\[Página (\d+)\]/g);
  if (!matches?.length) return 1;
  return parseInt(matches[matches.length - 1].replace(/\D/g, ''), 10);
}

/** Estimación de tokens suficiente para métricas (≈4 chars/token en español). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
