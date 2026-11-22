import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../src/panel-text-size.js', import.meta.url), 'utf8');

test('changes the panel size, remembers it after reopening, and stops at the bounds', async () => {
  const store = {};
  async function open() {
    const buttons = Array.from({ length: 2 }, () => ({
      addEventListener(name, action) { this.click = action; }
    }));
    const label = {};
    let scale;
    await runInNewContext('(async () => {' + script + '})()', {
      document: {
        documentElement: { style: { setProperty(name, value) {
          assert.equal(name, '--panel-text-scale');
          scale = value;
        } } },
        querySelectorAll: () => buttons,
        querySelector: () => label
      },
      chrome: { storage: { local: {
        get: async () => ({ ...store }),
        set: async update => Object.assign(store, update)
      } } }
    });
    return { buttons, label, scale: () => scale };
  }

  const original = await open();
  assert.equal(original.label.textContent, '100%');
  original.buttons[1].click();
  assert.equal(original.scale(), '1.15');

  const reopened = await open();
  assert.equal(reopened.label.textContent, '115%');
  for (let i = 0; i < 7; i++) reopened.buttons[1].click();
  assert.equal(reopened.label.textContent, '160%');
  assert.equal(reopened.buttons[1].disabled, true);
  for (let i = 0; i < 8; i++) reopened.buttons[0].click();
  assert.equal(reopened.label.textContent, '90%');
  assert.equal(reopened.buttons[0].disabled, true);
});
