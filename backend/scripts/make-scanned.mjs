/**
 * Crea un PDF "escaneado" a partir de uno nativo: rasteriza cada página a
 * imagen y la vuelve a meter en un PDF, de modo que el resultado NO tiene capa
 * de texto. Sirve para probar el OCR de forma realista.
 *
 *   node scripts/make-scanned.mjs [--src ../seed-data/01-....pdf] [--pages 8]
 *                                 [--out ../seed-data/escaneados] [--noise]
 *
 * --noise aplica una ligera rotación y ruido, como un escaneo de verdad.
 */
import { mkdirSync, readFileSync, createWriteStream, existsSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

/** Resuelve primero contra el directorio actual y, si no existe, contra scripts/. */
const ruta = (p, def) => {
  const v = arg(p, null);
  if (!v) return resolve(__dirname, def);
  const desdeCwd = resolve(process.cwd(), v);
  return existsSync(desdeCwd) ? desdeCwd : resolve(__dirname, v);
};

const SRC = ruta('src', '../../seed-data/01-arrendamiento-vivienda.pdf');
const OUT_DIR = (() => {
  const v = arg('out', null);
  return v ? resolve(process.cwd(), v) : resolve(__dirname, '../../seed-data/escaneados');
})();
const N_PAGES = parseInt(arg('pages', '8'), 10);
const SCALE = parseFloat(arg('scale', '1.6'));
const NOISE = argv.includes('--noise');

mkdirSync(OUT_DIR, { recursive: true });

const buf = new Uint8Array(readFileSync(SRC));
const pdf = await getDocumentProxy(buf);
const total = Math.min(N_PAGES, pdf.numPages);

const outFile = resolve(
  OUT_DIR,
  basename(SRC).replace(/\.pdf$/, `-escaneado${NOISE ? '-ruido' : ''}.pdf`),
);

const doc = new PDFDocument({ autoFirstPage: false });
doc.pipe(createWriteStream(outFile));

console.log(`Rasterizando ${total} páginas de ${basename(SRC)}…`);

for (let n = 1; n <= total; n++) {
  const png = await renderPageAsImage(pdf, n, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: SCALE,
  });

  let imgBuf = Buffer.from(png);

  if (NOISE) imgBuf = degradar(await loadImage(imgBuf));

  const img = await loadImage(imgBuf);
  doc.addPage({ size: [img.width * 0.5, img.height * 0.5], margin: 0 });
  doc.image(imgBuf, 0, 0, { width: img.width * 0.5 });
  process.stdout.write(`\r  página ${n}/${total}`);
}

doc.end();
console.log(`\n✓ ${outFile}`);
console.log('Este PDF no tiene capa de texto: al indexarlo se dispara el OCR.');

/** Simula un escaneo: leve inclinación, gris y ruido sal y pimienta. */
function degradar(img) {
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fdfdfa';
  ctx.fillRect(0, 0, img.width, img.height);

  ctx.save();
  ctx.translate(img.width / 2, img.height / 2);
  ctx.rotate((Math.random() * 0.6 - 0.3) * Math.PI / 180); // ±0.3°
  ctx.translate(-img.width / 2, -img.height / 2);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  const data = ctx.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.random() < 0.004) {
      const v = Math.random() < 0.5 ? 40 : 235;
      px[i] = px[i + 1] = px[i + 2] = v;
    } else {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const n = g + (Math.random() * 16 - 8);
      px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, n));
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toBuffer('image/png');
}
