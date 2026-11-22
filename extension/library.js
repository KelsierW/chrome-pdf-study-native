import { GlobalWorkerOptions, getDocument } from './vendor/build/pdf.mjs';
import Tesseract from './vendor/ocr/tesseract.esm.min.js';
import { parseExam } from './exams.js';

const assets = folder => new URL('./vendor/' + folder, import.meta.url).href;
GlobalWorkerOptions.workerSrc = assets('build/pdf.worker.mjs');
let database;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('study-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function access(mode, operate) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', mode);
    const request = operate(transaction.objectStore('files'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const getFiles = () => access('readonly', store => store.getAll());
export const getFile = id => access('readonly', store => store.get(id));
export const removeFile = id => access('readwrite', store => store.delete(id));
const saveFile = item => access('readwrite', store => store.put(item));

export async function fingerprint(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadPdf(blob) {
  const task = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    cMapUrl: assets('cmaps/'), cMapPacked: true, standardFontDataUrl: assets('standard_fonts/'),
    iccUrl: assets('iccs/'), wasmUrl: assets('wasm/'), isEvalSupported: false
  });
  try {
    return await task.promise;
  } catch (error) {
    await task.destroy();
    throw error;
  }
}

export async function renderPage(document, number, canvas, width) {
  const page = await document.getPage(number);
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
}

export async function pageText(page) {
  const content = await page.getTextContent();
  return content.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
}

export function startOcr() {
  return Tesseract.createWorker(['eng', 'chi_tra'], 1, {
    workerPath: assets('ocr/worker.min.js'), corePath: assets('ocr/core'),
    langPath: assets('ocr'), workerBlobURL: false, cacheMethod: 'none'
  });
}

async function readPdf(blob, onProgress) {
  const pdf = await loadPdf(blob);
  const pages = [];
  const scanned = [];
  let ocr;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      onProgress('讀取第 ' + number + ' / ' + pdf.numPages + ' 頁');
      const page = await pdf.getPage(number);
      let text = await pageText(page);
      if (text.trim().length < 30) {
        onProgress('辨識掃描第 ' + number + ' / ' + pdf.numPages + ' 頁');
        ocr ??= await startOcr();
        const canvas = document.createElement('canvas');
        await renderPage(pdf, number, canvas, 1900);
        text = (await ocr.recognize(canvas)).data.text;
        scanned.push(number);
      }
      pages.push(text.trim());
      page.cleanup();
    }
  } finally {
    if (ocr) await ocr.terminate();
    await pdf.loadingTask.destroy();
  }
  return { pages, scanned };
}

export function passageList(file) {
  return file.passages.map((passage, index) => ({
    ...passage, id: file.id + '.' + index, documentId: file.id, name: file.name, year: file.year
  }));
}

export async function importFile(file, isExam, onProgress) {
  const format = file.name.split('.').at(-1).toLowerCase();
  if (!['pdf', 'md', 'txt'].includes(format)) throw new Error('支援 PDF、TXT 和 Markdown。');
  const id = (await fingerprint(await file.arrayBuffer())).slice(0, 32)
    + (isExam ? '-exam' : '-note');
  if (await getFile(id)) return;
  const { pages, scanned } = format === 'pdf'
    ? await readPdf(file, onProgress)
    : { pages: [(await file.text()).trim()], scanned: [] };
  const year = isExam ? Number(file.name.match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/u)?.[1]) || null : null;
  const { questions, unassigned } = isExam ? parseExam({ pages }) : { questions: [], unassigned: [] };
  const unnumbered = questions.length
    ? unassigned
    : pages.map((text, index) => ({ text, page: index + 1 }));
  const passages = [...questions, ...unnumbered.flatMap(({ text, page: startPage }) => {
    const parts = text.match(/[\s\S]{1,1800}/gu) ?? [];
    return parts.filter(part => part.trim()).map(part => ({
      number: null, startPage, endPage: startPage, text: part.trim()
    }));
  })];
  if (!passages.length) throw new Error('這份檔案沒有可建立索引的文字。');
  onProgress('儲存 ' + passages.length + ' 筆資料');
  await saveFile({
    id, name: file.name, isExam, year, format, blob: file, passages, scanned,
    review: isExam && (!questions.length || !year || scanned.length > 0
      || Boolean(unassigned.length && unassigned[0].page > 1))
  });
}

export async function showOriginal(file, page, canvas) {
  const pdf = await loadPdf(file.blob);
  try {
    await renderPage(pdf, page, canvas, 1000);
  } finally {
    await pdf.loadingTask.destroy();
  }
}
