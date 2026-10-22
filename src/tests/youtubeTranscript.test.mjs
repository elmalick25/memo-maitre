import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeTimedText, getOfficialYouTubeTranscript } from '../lib/youtubeTranscript.js';

test('youtubeTranscript — parseYouTubeTimedText extrait les formats XML srv3, srv1 et JSON3', () => {
  // Test Format srv3
  const srv3Xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<p t="2800" d="4559" w="1"><s ac="0">Oh</s><s t="400" ac="0"> yeah,</s><s t="800" ac="0"> global</s><s t="1400" ac="0"> citizens.</s></p>
<p t="5359" d="4721" w="1"><s ac="0">learning</s><s t="280" ac="0"> English</s></p>
</timedtext>`;
  const srv3Result = parseYouTubeTimedText(srv3Xml);
  assert.equal(srv3Result.length, 2, 'Doit extraire 2 segments depuis srv3');
  assert.equal(srv3Result[0].start, 2.8);
  assert.equal(srv3Result[0].dur, 4.559);
  assert.equal(srv3Result[0].text, 'Oh yeah, global citizens.');

  // Test Format srv1
  const srv1Xml = `<?xml version="1.0" encoding="utf-8" ?><transcript>
<text start="1.5" dur="3.2">Welcome to this &amp;quot;lesson&amp;quot;</text>
</transcript>`;
  const srv1Result = parseYouTubeTimedText(srv1Xml);
  assert.equal(srv1Result.length, 1, 'Doit extraire 1 segment depuis srv1');
  assert.equal(srv1Result[0].start, 1.5);
  assert.equal(srv1Result[0].dur, 3.2);
  assert.equal(srv1Result[0].text, 'Welcome to this "lesson"');

  // Test Format JSON3
  const json3Data = {
    events: [
      { tStartMs: 1200, dDurationMs: 2500, segs: [{ utf8: "Hello " }, { utf8: "world" }] }
    ]
  };
  const json3Result = parseYouTubeTimedText(json3Data);
  assert.equal(json3Result.length, 1);
  assert.equal(json3Result[0].start, 1.2);
  assert.equal(json3Result[0].dur, 2.5);
  assert.equal(json3Result[0].text, 'Hello world');
});

test('youtubeTranscript — getOfficialYouTubeTranscript récupère les sous-titres d\'une vidéo réelle', async () => {
  // Test sur la vidéo fvVY1XDKhZk (Inside Out)
  const segments = await getOfficialYouTubeTranscript('fvVY1XDKhZk');
  assert.ok(Array.isArray(segments), 'Le résultat doit être un tableau');
  assert.ok(segments.length > 50, `Doit contenir de nombreux sous-titres officiels, reçu: ${segments.length}`);
  assert.ok(segments[0].start >= 0);
  assert.ok(typeof segments[0].text === 'string' && segments[0].text.length > 0);
});
