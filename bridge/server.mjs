import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTutor } from './gpt.mjs';
import { openPageReplies } from './page-replies.mjs';

const host = '127.0.0.1';
const port = 17372;
const origin = 'chrome-extension://gandhoboibijljiljagdjpchgcfpfikd';
const root = resolve(process.env.PDF_STUDY_DATA ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.study-data'));
const work = join(root, 'codex-work');
await mkdir(work, { recursive: true });
const tutor = createTutor(work);
const getReply = openPageReplies(join(root, 'replies'));

function shortText(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function normalize(value) { return value.normalize('NFKC').replace(/\s+/gu, ' ').trim(); }

function cleanReply(raw, references) {
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('GPT 傳回的格式不完整，請重試。'); }
  const remaining = new Map(references.map(ref => [ref.id, ref]));
  const matches = [];
  for (const match of Array.isArray(value.matches) ? value.matches : []) {
    const ref = remaining.get(match?.id);
    if (!ref) continue;
    const quote = normalize(shortText(match.quote, 400));
    if (quote.length < 10 || !normalize(ref.text).includes(quote)) continue;
    remaining.delete(ref.id);
    matches.push({ ...ref, quote, reason: shortText(match.reason, 500) });
  }
  return {
    answer: shortText(value.answer, 7000), translation: shortText(value.translation, 10000),
    points: (Array.isArray(value.points) ? value.points : []).slice(0, 4).map(point => shortText(point, 700)).filter(Boolean),
    matches
  };
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2_800_000) throw new Error('畫面或參考資料過大。');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  function respond(status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  }
  if (request.headers.host !== host + ':' + port || request.headers.origin !== origin) {
    respond(403, { error: '僅供已安裝的伴讀筆記擴充功能連線。' });
    return;
  }
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true'
    }).end();
    return;
  }
  if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) {
    respond(405, { error: '只接受 JSON 請求。' }); return;
  }
  try {
    if (request.url === '/ready') { respond(200, { ok: true }); return; }
    if (!['/page', '/ask'].includes(request.url)) { respond(404, { error: '找不到功能。' }); return; }
    const data = await readJson(request);
    const question = shortText(data.question, 1500);
    if (request.url === '/ask' && !question) { respond(400, { error: '請輸入問題。' }); return; }
    const text = shortText(data.text, 8000);
    const image = shortText(data.image, 2_000_000);
    if (image && !/^data:image\/(?:jpeg|png);base64,[a-z0-9+/]+={0,2}$/iu.test(image)) {
      respond(400, { error: '畫面格式無法辨識。' }); return;
    }
    if (!text && !image) { respond(400, { error: '目前頁面沒有可讀內容。' }); return; }
    const references = (Array.isArray(data.references) ? data.references : []).slice(0, 12).map(ref => ({
      id: shortText(ref.id, 100), name: shortText(ref.name, 240), documentId: shortText(ref.documentId, 120),
      text: shortText(ref.text, 1000), year: Number.isSafeInteger(ref.year) ? ref.year : null,
      number: shortText(ref.number, 15), startPage: Number(ref.startPage), endPage: Number(ref.endPage)
    })).filter(ref => ref.id && ref.text && Number.isSafeInteger(ref.startPage) && ref.startPage > 0);
    const generate = async () => {
      const reply = await tutor.ask({
        text, image, page: data.nativePdf ? (Number.isSafeInteger(data.nativePage) ? data.nativePage : null) : (data.webpage ? null : data.page), question,
        priorReply: shortText(data.priorReply, 2400),
        history: (Array.isArray(data.history) ? data.history : []).slice(-6).map(turn => shortText(turn, 900)),
        references: references.map(({ id, text: excerpt }) => ({ id, text: excerpt }))
      });
      const value = cleanReply(reply.answer, references);
      if (question && !value.answer) throw new Error('GPT 未回傳答案，請重試。');
      return { ...reply, answer: JSON.stringify(value) };
    };
    const result = request.url === '/page'
      ? await getReply({ threadId: 'chrome-study-v1', documentFingerprint: data.documentFingerprint, page: data.page }, generate)
      : { reply: await generate(), reused: false };
    respond(200, { ...JSON.parse(result.reply.answer), reused: result.reused });
  } catch (error) {
    respond(502, { error: error.message });
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  tutor.close();
  server.close();
});
server.listen(port, host, () => console.log('伴讀筆記已啟動：http://' + host + ':' + port));
