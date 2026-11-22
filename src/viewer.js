import { fingerprint, loadPdf, pageText, renderPage, startOcr } from './library.js';

const container = document.querySelector('#pages');
const fileInput = document.querySelector('#lecture');
const jump = document.querySelector('#jump');
const status = document.querySelector('#viewer-status');
const tab = await chrome.tabs.getCurrent();
const viewKey = 'pdf-view-' + tab.id;
await chrome.storage.session.set({ [viewKey]: { loading: true } });
let lecture;
let page = 0;
let settle;
let ocr;
const displayed = new Map();

async function paint(document, number) {
  const frame = container.children[number - 1];
  if (!frame || lecture?.document !== document) return;
  if (!displayed.has(number)) {
    const canvas = window.document.createElement('canvas');
    displayed.set(number, renderPage(document, number, canvas, 1350).then(() => {
      if (frame.isConnected && lecture?.document === document) {
        frame.style.aspectRatio = canvas.width + ' / ' + canvas.height;
        frame.replaceChildren(canvas);
      }
      return canvas;
    }).catch(error => {
      if (lecture?.document === document) displayed.delete(number);
      throw error;
    }));
  }
  return displayed.get(number);
}

function updatePage() {
  if (!lecture) return;
  const { document, id, name } = lecture;
  const center = window.innerHeight * .43 + documentBarHeight();
  const index = Array.from(container.children).findIndex(node => node.getBoundingClientRect().bottom > center);
  const number = index < 0 ? document.numPages : index + 1;
  if (number === page) return;
  page = number;
  jump.value = number;
  clearTimeout(settle);
  void chrome.storage.session.set({ [viewKey]: { loading: true } });
  for (const neighbor of [number, number - 1, number + 1]) {
    paint(document, neighbor).catch(error => { if (lecture?.document === document) status.textContent = error.message; });
  }
  for (const shown of displayed.keys()) {
    if (Math.abs(shown - number) <= 4) continue;
    const rendering = displayed.get(shown);
    rendering.then(() => {
      if (lecture?.document !== document || Math.abs(shown - page) <= 4 || displayed.get(shown) !== rendering) return;
      displayed.delete(shown);
      container.children[shown - 1].replaceChildren();
    }).catch(() => {});
  }
  settle = setTimeout(async () => {
    try {
      const canvas = await paint(document, number);
      if (!canvas || lecture?.document !== document || page !== number) return;
      let text = await pageText(await document.getPage(number));
      if (text.length < 35) {
        try {
          ocr ??= startOcr();
          text = (await (await ocr).recognize(canvas)).data.text.trim();
        } catch (error) {
          console.warn('目前頁面的 OCR 無法使用', error.message);
          ocr = undefined;
        }
      }
      if (lecture?.document !== document || page !== number) return;
      await chrome.storage.session.set({
        [viewKey]: { documentFingerprint: id, page: number, title: name, text: text.slice(0, 8000),
          image: canvas.toDataURL('image/jpeg', .72) }
      });
    } catch (error) {
      if (lecture?.document === document && page === number) status.textContent = error.message;
    }
  }, 550);
}

const documentBarHeight = () => document.querySelector('.viewer-bar').offsetHeight;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.disabled = true;
  status.hidden = false;
  status.textContent = '讀取 PDF…';
  clearTimeout(settle);
  const previous = lecture;
  lecture = undefined;
  page = 0;
  displayed.clear();
  container.replaceChildren();
  jump.disabled = true;
  let pdf;
  try {
    await chrome.storage.session.set({ [viewKey]: { loading: true } });
    await previous?.document.loadingTask.destroy();
    const [id, loaded] = await Promise.all([file.arrayBuffer().then(fingerprint), loadPdf(file)]);
    pdf = loaded;
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const pages = document.createDocumentFragment();
    for (let number = 1; number <= pdf.numPages; number++) {
      const frame = document.createElement('section');
      frame.className = 'pdf-page';
      frame.style.aspectRatio = first.width + ' / ' + first.height;
      frame.setAttribute('aria-label', '第 ' + number + ' 頁');
      pages.append(frame);
    }
    container.replaceChildren(pages);
    lecture = { document: pdf, id, name: file.name };
    document.querySelector('#filename').textContent = file.name;
    document.querySelector('#total').textContent = '/ ' + pdf.numPages;
    jump.max = pdf.numPages;
    jump.disabled = false;
    status.hidden = true;
    window.scrollTo(0, 0);
    updatePage();
  } catch (error) {
    await pdf?.loadingTask.destroy();
    status.textContent = '無法開啟 PDF。' + error.message;
  } finally {
    fileInput.value = '';
    fileInput.disabled = false;
  }
});
jump.addEventListener('change', () => {
  const target = container.children[jump.valueAsNumber - 1];
  if (target) target.scrollIntoView({ block: 'start' });
  else jump.value = page;
});
window.addEventListener('scroll', updatePage, { passive: true });
window.addEventListener('resize', updatePage);
fileInput.disabled = false;
