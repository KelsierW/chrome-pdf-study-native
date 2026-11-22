import { fingerprint, getFiles, getFile, importFile, passageList, removeFile, showOriginal, startOcr } from './library.js';
import { findReferences } from './references.js';
import { snapshotWebpage } from './viewport.js';
import { submitQuestionOnEnter } from './question-keyboard.js';
import { nativePdfReader } from './native-pdf.js';

const $ = selector => document.querySelector(selector);
const status = $('#status');
const fileSettings = $('#file-settings');
const importStatus = $('#import-status');
const follow = $('#follow');
const windowId = (await chrome.windows.getCurrent()).id;
const tabKey = 'followed-' + windowId;
const viewerUrl = chrome.runtime.getURL('viewer.html');
const endpoint = 'http://127.0.0.1:17372';
const readNativePdf = nativePdfReader(fingerprint, startOcr);
const replies = new Map();
const conversations = new Map();
let files = [];
let passages = [];
let current;
let candidate;
let following = false;
let reviewJob = false;
let askJob = false;
let exams = false;
let importing = false;

function statusText(text) { status.textContent = text; }
function importStatusText(text) {
  importStatus.hidden = !text;
  importStatus.textContent = text;
}
fileSettings.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
});
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function call(path, payload) {
  let response;
  try {
    response = await fetch(endpoint + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('本機橋接未連線。請先執行「啟動伴讀.cmd」。');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'GPT 無法回覆。');
  return result;
}

function key(view) { return view.documentFingerprint + ':' + view.page; }

async function capturePdf(tab) {
  if (!current && !reviewJob && !askJob) statusText('等候 PDF 畫面停穩，準備辨識…');
  try {
    return await readNativePdf(tab, windowId);
  } catch {
    if (!reviewJob && !askJob) statusText('Chrome 無法擷取此分頁。請在 PDF 分頁點一次原生 PDF 版圖示。');
  }
}

async function readView() {
  const [active] = await chrome.tabs.query({ windowId, active: true });
  const chosen = (await chrome.storage.session.get(tabKey))[tabKey];
  if (active?.id !== chosen || !active?.id) {
    fileSettings.hidden = true;
    if (!reviewJob && !askJob) statusText('請切到 PDF 分頁，點 Chrome 工具列的「伴讀筆記（原生 PDF 版）」。');
    return;
  }
  const name = 'pdf-view-' + active.id;
  const pdf = (await chrome.storage.session.get(name))[name];
  const url = active.url ?? '';
  const needsFileAccess = !pdf && url !== viewerUrl && (!url || url.startsWith('file:'))
    && !await chrome.extension.isAllowedFileSchemeAccess();
  fileSettings.hidden = !needsFileAccess;
  if (pdf) return pdf.loading ? undefined : pdf;
  if (url === viewerUrl) return;
  if (needsFileAccess) {
    if (!reviewJob && !askJob) statusText('若這是本機 PDF，請開啟「允許存取檔案網址」，再回講義分頁點一次新版圖示。');
    return;
  }
  if (/^file:\/\//u.test(url) && /\.pdf(?:$|[?#])/iu.test(url)) return capturePdf(active);
  if (!/^https?:\/\//u.test(url)) {
    if (!reviewJob && !askJob) statusText('這個分頁沒有可跟讀的內容。請在 PDF 分頁點一次原生 PDF 版圖示。');
    return;
  }
  if (/\.pdf(?:$|[?#])/iu.test(url)) return capturePdf(active);

  const [{ result: text }] = await chrome.scripting.executeScript({
    target: { tabId: active.id },
    func: snapshotWebpage
  });
  const [stillActive] = await chrome.tabs.query({ windowId, active: true });
  if (stillActive?.id !== active.id || stillActive.url !== active.url) return;
  if (text === null) return capturePdf(active);
  if (!text) return;
  const encoder = new TextEncoder();
  const [documentFingerprint, area] = await Promise.all([
    fingerprint(encoder.encode(url.split('#')[0])), fingerprint(encoder.encode(text))
  ]);
  return { page: Number.parseInt(area.slice(0, 12), 16) + 1, documentFingerprint, title: active.title, text, webpage: true };
}

function viewLabel(view) { const page = view.nativePdf ? view.nativePage : view.page; return view.webpage ? view.title : view.title + (page ? ' · 第 ' + page + ' 頁' : ' · 目前畫面'); }
function showScreen(sources) {
  $('#reading').hidden = sources;
  $('#sources').hidden = !sources;
  $('#question-form').hidden = sources;
  $('#show-reading').setAttribute('aria-pressed', String(!sources));
  $('#show-sources').setAttribute('aria-pressed', String(sources));
}

async function renderOriginal(reference) {
  const target = $('#original-content');
  $('#original-title').textContent = citationTitle(reference);
  target.replaceChildren(element('blockquote', reference.quote, 'prose'));
  $('#original').showModal();
  try {
    const file = await getFile(reference.documentId);
    if (!file) { target.append(element('p', '參考檔已移除，目前保留原引文。')); return; }
    if (file.format !== 'pdf') {
      target.append(element('p', await file.blob.text(), 'prose')); return;
    }
    for (let page = reference.startPage; page <= (reference.endPage || reference.startPage); page++) {
      if (!$('#original').open) break;
      const canvas = element('canvas', '');
      canvas.setAttribute('aria-label', '原始 PDF 第 ' + page + ' 頁');
      target.append(element('p', 'PDF 第 ' + page + ' 頁', 'fine-print'), canvas);
      await showOriginal(file, page, canvas);
    }
  } catch (error) { target.append(element('p', error.message, 'prose')); }
}

function citationTitle(ref) {
  const label = ref.year && ref.number ? ref.year + ' 年第 ' + ref.number + ' 題' : ref.name;
  const pages = ref.endPage && ref.endPage !== ref.startPage ? '–' + ref.endPage : '';
  return label + ' · 第 ' + ref.startPage + pages + ' 頁';
}

function addMatches(parent, matches) {
  if (!matches?.length) return;
  const section = element('section', '', 'card');
  section.append(element('h3', '對照原文'));
  const years = new Set(matches.filter(match => match.number && match.year).map(match => match.year));
  if (years.size > 1) section.append(element('p', '找到 ' + years.size + ' 個年份的相關考題。', 'fine-print'));
  for (const match of matches) {
    const button = element('button', citationTitle(match), 'citation');
    button.type = 'button';
    button.append(element('small', match.reason));
    button.addEventListener('click', () => void renderOriginal(match));
    section.append(button);
  }
  parent.append(section);
}

function card(title, text) {
  const node = element('section', '', 'card');
  node.append(element('h3', title), element('p', text, 'prose'));
  return node;
}

function chatTurns(view) {
  return conversations.get(view.documentFingerprint) ?? [];
}

function render(view, reply) {
  $('#location').textContent = viewLabel(view);
  const result = $('#page-reply');
  const chat = $('#conversation');
  result.replaceChildren();
  chat.replaceChildren();
  if (reply) {
    if (reply.translation) result.append(card('繁中翻譯', reply.translation));
    if (reply.points?.length) {
      const points = element('section', '', 'card');
      const list = element('ul', '', 'points');
      for (const point of reply.points) list.append(element('li', point));
      points.append(element('h3', '重點'), list);
      result.append(points);
    }
    addMatches(result, reply.matches);
    if (!result.childElementCount) result.append(element('p', '本頁沒有需要展開的內容。', 'fine-print'));
  }
  for (const turn of chatTurns(view)) {
    if (turn.pageKey !== key(view)) continue;
    chat.append(card(turn.label, turn.question), card('GPT', turn.answer));
    addMatches(chat, turn.matches);
  }
  $('#ask').disabled = askJob;
}

async function analyze(view) {
  if (!following) return;
  if (replies.has(key(view))) {
    render(view, replies.get(key(view)));
    if (!askJob) statusText('已顯示上次的回答。');
    return;
  }
  if (reviewJob) return;
  reviewJob = true;
  statusText('GPT 正在整理這一頁…');
  try {
    const result = await call('/page', { ...view, references: findReferences(view.text, passages) });
    replies.set(key(view), result);
    if (following && current && key(current) === key(view)) {
      render(view, result);
      if (!askJob) window.scrollTo(0, 0);
      if (!askJob) statusText(result.reused ? '已顯示上次的回答。' : '已整理目前頁面。');
    }
  } catch (error) {
    if (current && key(current) === key(view)) {
      statusText(error.message);
      const retry = element('button', '重新載入本頁');
      retry.addEventListener('click', () => { retry.remove(); void analyze(view); });
      $('#page-reply').replaceChildren(retry);
    }
  } finally {
    reviewJob = false;
    if (following && current && key(current) !== key(view)) void analyze(current);
  }
}

async function monitor() {
  try {
    if (!following) return;
    const view = await readView();
    if (!following || !view) { candidate = undefined; return; }
    if (current && key(current) === key(view)) { current = view; return; }
    const next = key(view);
    if (candidate !== next) { candidate = next; return; }
    current = view;
    render(view, replies.get(next));
    window.scrollTo(0, 0);
    void analyze(view);
  } catch (error) {
    candidate = undefined;
    if (following && !reviewJob) statusText('這個分頁暫時無法讀取。網頁請重新點擴充圖示，PDF 可用伴讀閱讀器。');
  } finally {
    setTimeout(monitor, 560);
  }
}

async function reloadSources() {
  files = await getFiles();
  passages = files.flatMap(passageList);
  const list = $('#reference-list');
  list.replaceChildren();
  if (!files.length) list.append(element('li', '尚未加入參考資料。', 'fine-print'));
  for (const file of files) {
    const item = element('li', '', 'card');
    const description = file.passages.length + ' 筆' + (file.review ? ' · 請核對年份或 OCR 題號' : '');
    const metadata = element('div', file.name);
    metadata.append(element('p', description, 'fine-print'));
    const remove = element('button', '移除');
    remove.type = 'button';
    remove.setAttribute('aria-label', '移除 ' + file.name);
    remove.addEventListener('click', async () => {
      try { await removeFile(file.id); await reloadSources(); }
      catch (error) { statusText(error.message); }
    });
    item.append(metadata, remove);
    list.append(item);
  }
}

follow.addEventListener('click', () => {
  following = !following;
  follow.textContent = following ? '暫停跟讀' : '開始跟讀';
  follow.setAttribute('aria-pressed', String(following));
  candidate = undefined;
  if (following && current && !replies.has(key(current))) void analyze(current);
  statusText(following ? '等候已選分頁停在新內容。' : '跟讀已暫停。');
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !(tabKey in changes)) return;
  candidate = undefined;
  current = undefined;
  $('#location').textContent = '已選取目前分頁';
  $('#page-reply').replaceChildren();
  $('#conversation').replaceChildren();
  $('#ask').disabled = true;
});
$('#open-pdf').addEventListener('click', async () => {
  try {
    const tab = await chrome.tabs.create({ windowId, url: viewerUrl });
    await chrome.storage.session.set({ [tabKey]: tab.id });
  } catch (error) { statusText(error.message); }
});
$('#show-reading').addEventListener('click', () => showScreen(false));
$('#show-sources').addEventListener('click', () => showScreen(true));
for (const [id, isExam] of [['#add-exams', true], ['#add-notes', false]]) {
  $(id).addEventListener('click', () => { exams = isExam; $('#reference-input').click(); });
}
$('#reference-input').addEventListener('change', async event => {
  if (importing) return;
  importing = true;
  const input = event.target;
  $('#add-exams').disabled = $('#add-notes').disabled = true;
  const errors = [];
  try {
    for (const file of input.files) {
      try { await importFile(file, exams, message => importStatusText(file.name + ' · ' + message)); }
      catch (error) { errors.push(file.name + ' · ' + error.message); }
    }
    await reloadSources();
    importStatusText(errors.length ? errors.join('／') : '參考資料已就緒。已讀頁的原回答仍可回看。');
  } catch (error) { importStatusText(error.message); }
  finally {
    importing = false;
    input.value = '';
    $('#add-exams').disabled = $('#add-notes').disabled = false;
  }
});
$('#question').addEventListener('keydown', submitQuestionOnEnter);
$('#question-form').addEventListener('submit', async event => {
  event.preventDefault();
  const questionBox = $('#question');
  const question = questionBox.value.trim();
  if (!question || !current || askJob) return;
  const view = current;
  const prior = replies.get(key(view));
  const cached = prior ? [prior.translation, ...(prior.points ?? [])].join('\n') : '';
  const turns = chatTurns(view);
  const history = turns.flatMap(turn => ['讀者：' + turn.question, 'GPT：' + turn.answer]);
  askJob = true;
  $('#ask').disabled = true;
  statusText('GPT 正在回答…');
  try {
    const result = await call('/ask', {
      ...view, question, priorReply: cached, history,
      references: findReferences([question, view.text, cached].join('\n'), passages)
    });
    turns.push({ pageKey: key(view), question, answer: result.answer, matches: result.matches, label: viewLabel(view) });
    conversations.set(view.documentFingerprint, turns);
    if (current?.documentFingerprint === view.documentFingerprint) {
      render(current, replies.get(key(current)));
      if (key(current) === key(view)) $('#conversation').lastElementChild?.scrollIntoView({ block: 'end' });
    }
    if (questionBox.value.trim() === question) questionBox.value = '';
    statusText('回答已更新。');
  } catch (error) { statusText(error.message); }
  finally { askJob = false; $('#ask').disabled = !current; }
});

await reloadSources().catch(error => statusText(error.message));
void monitor();
