import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitQuestionOnEnter } from '../src/question-keyboard.js';

function press(overrides = {}) {
  const result = { prevented: false, submits: 0 };
  submitQuestionOnEnter({
    key: 'Enter',
    preventDefault() { result.prevented = true; },
    currentTarget: { form: { requestSubmit() { result.submits++; } } },
    ...overrides
  });
  return result;
}

test('plain Enter uses form submission once and holding it down cannot resubmit', () => {
  assert.deepEqual(press(), { prevented: true, submits: 1 });
  assert.deepEqual(press({ repeat: true }), { prevented: true, submits: 0 });
});

test('Shift+Enter and IME confirmation keep their original behavior', () => {
  for (const overrides of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    assert.deepEqual(press(overrides), { prevented: false, submits: 0 });
  }
});
