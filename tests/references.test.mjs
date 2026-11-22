import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExam } from '../src/exams.js';
import { findReferences } from '../src/references.js';

test('finds the matching exam question and keeps the source page across a page break', () => {
  const { questions } = parseExam({ pages: [
    'Exam\n1. Describe disk scheduling.\n2. Explain thread-local cache',
    'and how it avoids allocator lock contention.\n3. What is a file system?'
  ] });
  const [first] = findReferences('A thread-local cache reduces lock contention.', questions);
  assert.equal(first.number, '2');
  assert.equal(first.startPage, 1);
  assert.equal(first.endPage, 2);
  assert.match(first.text, /allocator lock contention/u);
});

test('scanned rubrics tolerate an unreadable question without inventing its number', () => {
  const { questions, unassigned } = parseExam({
    pages: ['11. [6] OCR misread first question\n2. [4] Thread-local cache\n'
      + 'a. [2] Explain the lock\n€. [8] OCR misread third question\n4. [5] Scheduling']
  });
  assert.deepEqual(questions.map(question => question.number), ['2', '4']);
  assert.match(questions[0].text, /Explain the lock/u);
  assert.doesNotMatch(questions[0].text, /third question/u);
  assert.match(unassigned[0].text, /first question[\s\S]*third question/u);
});
