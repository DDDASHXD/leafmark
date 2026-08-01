import assert from 'node:assert/strict';
import test from 'node:test';
import { countText, isInside, naturalSort } from '../model.js';

test('path containment rejects siblings', () => {
  assert.equal(isInside('/work/book/a.md', '/work/book'), true);
  assert.equal(isInside('/work/bookish/a.md', '/work/book'), false);
});

test('natural chapter sorting puts numeric prefixes first', () => {
  assert.deepEqual(['notes.md', '10-end.md', '2-start.md'].sort(naturalSort), ['2-start.md', '10-end.md', 'notes.md']);
});

test('counts plain Markdown text', () => {
  assert.deepEqual(countText('# Hello **wide world**'), { words: 3, charsWithSpaces: 16, charsWithoutSpaces: 14 });
});
