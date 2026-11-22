import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/panel.js', import.meta.url), 'utf8');

test('a newly visible page shows its summary and questions while older turns are retained', () => {
  const begin = source.indexOf('function render(view, reply)');
  const end = source.indexOf('async function analyze(', begin);
  assert.ok(begin >= 0 && end > begin, 'Panel render function must be present');
  const makeNode = () => ({
    children: [],
    replaceChildren() { this.children = []; },
    append(...nodes) { this.children.push(...nodes); }
  });
  const nodes = Object.fromEntries(['#location', '#page-reply', '#conversation', '#ask']
    .map(selector => [selector, makeNode()]));
  const allTurns = [
    { pageKey: 'lecture:21', question: 'previous question', answer: 'previous answer' },
    { pageKey: 'lecture:22', question: 'current question', answer: 'current answer' }
  ];
  const render = runInNewContext(source.slice(begin, end) + '\nrender', {
    $: selector => nodes[selector],
    key: view => 'lecture:' + view.page,
    viewLabel: view => String(view.page),
    chatTurns: () => allTurns,
    card: (title, text) => text,
    element: () => ({}),
    addMatches() {},
    askJob: false
  });
  render({ page: 22 }, { translation: 'current translation' });
  assert.ok(nodes['#page-reply'].children.includes('current translation'));
  assert.deepEqual(nodes['#conversation'].children, ['current question', 'current answer']);
  render({ page: 21 }, { translation: 'previous translation' });
  assert.deepEqual(nodes['#conversation'].children, ['previous question', 'previous answer']);
  assert.equal(allTurns.length, 2);
});
