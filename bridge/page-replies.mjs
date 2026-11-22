import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function openPageReplies(directory) {
  // shortcut: coalesce in one bridge process, add a shared lock if multiple bridges share the cache.
  const pending = new Map();

  return async function getOrGenerate({ threadId, documentFingerprint, page }, generate) {
    if (typeof threadId !== 'string' || !threadId.trim()
      || typeof documentFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(documentFingerprint)
      || !Number.isSafeInteger(page) || page < 1) {
      throw new TypeError('A chat ID, SHA-256 document fingerprint, and positive page number are required.');
    }

    const key = createHash('sha256')
      .update(JSON.stringify([threadId, documentFingerprint, page])).digest('hex');
    const path = join(directory, key + '.json');

    if (pending.has(key)) {
      const shared = await pending.get(key);
      return { ...shared, reused: true };
    }

    const work = (async () => {
      try {
        const reply = JSON.parse(await readFile(path, 'utf8'));
        checkReply(reply);
        return { reply, reused: true };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      await mkdir(directory, { recursive: true });
      const reply = await generate();
      checkReply(reply);
      const temporary = path + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(reply), { encoding: 'utf8', flag: 'wx' });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      return { reply, reused: false };
    })();

    pending.set(key, work);
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  };
}

function checkReply(reply) {
  for (const field of ['turnId', 'itemId', 'answer']) {
    if (typeof reply?.[field] !== 'string' || !reply[field].trim()) {
      throw new TypeError('A completed reply must include its turn ID, item ID, and answer.');
    }
  }
}
