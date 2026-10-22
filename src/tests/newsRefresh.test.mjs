import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareNewsBatch, canonicalNewsUrl } from '../lib/newsRefresh.js';
import { isOfficialScholarshipCandidate, preserveOfficialDeadline } from '../lib/scholarshipRefresh.js';

const english = { id: 'news-1', lang: 'en', title: 'The new model', description: 'The complete source description.', fullContent: 'The first paragraph.\n\nThe final paragraph.', url: 'https://example.org/news' };
test('Refresh completes only after French title, entire description and final body paragraph are ready', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let finished = false;
  const translations = {
    'The new model': 'Le nouveau modèle',
    'The complete source description.': 'La description complète fournie par la source.',
    'The first paragraph.\n\nThe final paragraph.': 'Le premier paragraphe.\n\nLe dernier paragraphe.',
  };
  const work = prepareNewsBatch([english], { translate: async text => { if (text === english.fullContent) await gate; return translations[text] || ''; }, extract: async () => '' }).then(result => { finished = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(finished, false);
  release();
  const result = await work;
  assert.equal(result.items[0].titleFr, 'Le nouveau modèle');
  assert.equal(result.items[0].descriptionFr, 'La description complète fournie par la source.');
  assert.equal(result.items[0].bodyFr, 'Le premier paragraphe.\n\nLe dernier paragraphe.');
});
test('Failed translation is explicitly pending, never shown as English', async () => {
  const result = await prepareNewsBatch([english], { translate: async () => '', extract: async () => '' });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.pending, ['news-1']);
});
test('Unavailable original body uses the whole source description without invented analysis', async () => {
  const item = { id: 'fr-1', lang: 'fr', title: 'Une actualité', description: 'La première phrase. La dernière phrase.', url: 'https://example.org/news' };
  const result = await prepareNewsBatch([item], { translate: async () => { throw new Error('French must not need translation'); }, extract: async () => '' });
  assert.equal(result.items[0].bodyFr, item.description);
  assert.equal(result.items[0].contentState, 'source-unavailable');
});
test('No source paragraph is truncated even when the description exceeds ten sentences', async () => {
  const description = Array.from({length: 14}, (_, i) => `La phrase ${i+1}.`).join(' ');
  const result = await prepareNewsBatch([{ id:'long', lang:'fr', title:'Le rapport', description }], { translate:async () => '', extract:async () => '' });
  assert.equal(result.items[0].descriptionFr, description);
});
test('Deduplication preserves distinct content queries and removes only tracking', () => {
  assert.equal(canonicalNewsUrl('https://example.org/news?id=1&utm_source=rss#top'), 'https://example.org/news?id=1');
  assert.notEqual(canonicalNewsUrl('https://example.org/news?id=1'), canonicalNewsUrl('https://example.org/news?id=2'));
});
test('Scholarship refresh refuses unofficial candidate URLs', () => {
  const item={ title:'Programme', provider:'Organisme', country:'France', officialUrl:'https://campusfrance.org/programme' };
  assert.equal(isOfficialScholarshipCandidate(item), true);
  assert.equal(isOfficialScholarshipCandidate({...item, officialUrl:'https://campusfrance.org.fake.org/programme'}), false);
});
test('Closed official deadlines are preserved, not fabricated for next year', () => {
  const deadline={nextDate:'2025-01-31',isStrict:true};
  assert.deepEqual(preserveOfficialDeadline(deadline), {nextDate:'2025-01-31',isStrict:true});
  assert.equal(preserveOfficialDeadline(null).nextDate, null);
});
