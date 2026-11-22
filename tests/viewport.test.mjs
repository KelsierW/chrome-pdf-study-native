import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { snapshotWebpage } from '../src/viewport.js';

test('viewport context excludes the hidden portion of a paragraph and editable text', () => {
  const inView = { left: 20, right: 150, top: 48, bottom: 68, width: 130, height: 20 };
  const below = { ...inView, top: 520, bottom: 540 };
  const paragraph = { textContent: 'Visible hidden', parentElement: { closest: () => null } };
  const editable = { textContent: 'Private draft', parentElement: { closest: () => true } };
  const viewport = runInNewContext('(' + snapshotWebpage.toString() + ')()', {
    document: {
      documentElement: { lang: 'en' },
      querySelector: () => ({}),
      createTreeWalker(root, filter, { acceptNode }) {
        const nodes = [paragraph, editable].filter(node => acceptNode(node) === 1);
        return { nextNode: () => nodes.shift() };
      },
      createRange() {
        let start = -1;
        return {
          selectNodeContents() { start = -1; },
          setStart(node, index) { start = index; },
          setEnd() {},
          getClientRects() { return start === -1 ? [inView, below] : [start < 8 ? inView : below]; }
        };
      }
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
    innerHeight: 450, innerWidth: 350
  });
  assert.equal(viewport, 'Visible');
});

test('recognizes a PDF frame even when its address has no PDF extension', () => {
  assert.equal(runInNewContext('(' + snapshotWebpage.toString() + ')()', {
    document: { contentType: 'application/pdf' }
  }), null);
});
