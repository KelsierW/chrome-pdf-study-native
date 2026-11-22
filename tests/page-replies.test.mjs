import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openPageReplies } from '../bridge/page-replies.mjs';

const reference = {
  threadId: 'test-chat',
  documentFingerprint: createHash('sha256').update('synthetic lecture').digest('hex'),
  page: 12
};
const reply = { turnId: 'turn-12', itemId: 'answer-12', answer: '第 12 頁的原始回答' };

async function testDirectory(t) {
  const root = process.env.PDF_STUDY_TEST_WORK ?? tmpdir();
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'page-replies-'));
  t.after(async () => {
    for (const file of await readdir(directory)) await unlink(join(directory, file));
    await rmdir(directory);
  });
  return directory;
}

test('returning to page 12 restores the exact saved answer without generating', async t => {
  const directory = await testDirectory(t);
  const request = openPageReplies(directory);
  assert.deepEqual(await request(reference, async () => reply), { reply, reused: false });
  await request({ ...reference, page: 13 }, async () => ({
    turnId: 'turn-13', itemId: 'answer-13', answer: '第 13 頁的回答'
  }));

  const reopen = openPageReplies(directory);
  assert.deepEqual(await reopen(reference, () => assert.fail('duplicate generation')),
    { reply, reused: true });
});

test('simultaneous requests use one generator and unsuccessful replies are retryable', async t => {
  const request = openPageReplies(await testDirectory(t));
  await assert.rejects(request(reference, async () => {
    throw new Error('interrupted');
  }), /interrupted/u);

  const results = await Promise.all([
    request(reference, async () => reply),
    request(reference, () => assert.fail('duplicate generation'))
  ]);
  assert.deepEqual(results, [{ reply, reused: false }, { reply, reused: true }]);
});
