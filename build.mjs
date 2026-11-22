import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';

await mkdir('extension/vendor', { recursive: true });
await cp('src', 'extension', { recursive: true });
const modules = existsSync('node_modules/pdfjs-dist') ? 'node_modules/' : '../chrome-pdf-study/node_modules/';
const pdfjs = modules + 'pdfjs-dist/';
for (const file of [
  'LICENSE', 'build/pdf.mjs', 'build/pdf.worker.mjs', 'cmaps', 'standard_fonts', 'iccs', 'wasm'
]) {
  await cp(pdfjs + file, 'extension/vendor/' + file, { recursive: true });
}
await mkdir('extension/vendor/ocr', { recursive: true });
for (const file of ['tesseract.esm.min.js', 'worker.min.js', 'worker.min.js.LICENSE.txt']) {
  await cp(modules + 'tesseract.js/dist/' + file, 'extension/vendor/ocr/' + file);
}
await cp(modules + 'tesseract.js-core', 'extension/vendor/ocr/core', { recursive: true });
for (const language of ['eng', 'chi_tra']) {
  const file = language + '.traineddata.gz';
  await cp(modules + '@tesseract.js-data/' + language + '/4.0.0_best_int/' + file,
    'extension/vendor/ocr/' + file);
}

await cp(modules + 'tesseract.js/LICENSE.md', 'extension/vendor/ocr/TESSERACT-LICENSE.md');
