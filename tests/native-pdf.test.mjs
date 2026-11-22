import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativePdfReader, nativePageKey, parsePdfToolbar } from '../src/native-pdf.js';

test('recognizes valid toolbar page labels and rejects out-of-range labels', () => {
  assert.equal(parsePdfToolbar('Lecture 2026/11\n 18 / 80       100%'), 18);
  assert.equal(parsePdfToolbar('12 of 323'), 12);
  assert.equal(parsePdfToolbar('98 / 80'), null);
  assert.equal(parsePdfToolbar('100%'), null);
});

test('a recognized page has the same cache key at different zoom levels', () => {
  assert.equal(nativePageKey(18, 'aaaabbbbcccc'), nativePageKey(18, '123456789abc'));
  assert.ok(nativePageKey(null, '000000000000') > 100000);
  assert.notEqual(nativePageKey(null, 'aaaabbbbcccc'), nativePageKey(null, '123456789abc'));
});


test('reads only a settled frame from the selected tab and ignores a tab switch', async t => {
  const active = { id: 7, width: 1400, url: 'file:///lecture.pdf', title: 'Lecture' };
  const image = 'data:image/jpeg;base64,YWJj';
  let focusChanged;
  let switchDuringCapture = false;
  let calls = 0;
  const originals = { chrome: globalThis.chrome, Image: globalThis.Image, document: globalThis.document };
  t.after(() => Object.assign(globalThis, originals));
  globalThis.chrome = { tabs: {
    onActivated: { addListener: listener => { focusChanged = listener; } },
    captureVisibleTab: async () => {
      calls++;
      if (switchDuringCapture) focusChanged();
      return image;
    },
    query: async () => [active]
  } };
  globalThis.Image = class {
    naturalWidth = 1400;
    naturalHeight = 850;
    async decode() {}
  };
  globalThis.document = { createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => image
  }) };
  const reader = nativePdfReader(async () => 'a'.repeat(64), async () => ({
    setParameters: async () => {},
    recognize: async canvas => ({ data: { text: canvas.height < 150 ? '18 / 80' : 'Memory fragmentation' } })
  }));
  assert.equal(await reader(active, 1), undefined);
  const result = await reader(active, 1);
  assert.equal(result.page, 18);
  assert.match(result.text, /fragmentation/);
  assert.equal(await reader(active, 1), result);
  switchDuringCapture = true;
  assert.equal(await reader(active, 1), undefined);
  assert.equal(calls, 4);
});
