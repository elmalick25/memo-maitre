import { stripMarkdownAndAsterisks } from './newsTextPresentation.js';
import { looksFrench } from './frenchNews.js';

/** Prepare privately; callers publish only after every worker finishes. */
export async function prepareNewsBatch(items, {
  translate, extract, bodies = {}, concurrency = 4, onProgress = () => {},
}) {
  const ready = new Array(items.length);
  const unavailable = [];
  const pending = [];
  let cursor = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      try {
        const french = item.lang === 'fr';
        const title = french ? item.title : item.titleFr || await translate(item.title || '');
        if (!title || (!french && !looksFrench(title))) { pending.push(item.id); continue; }
        let description = french ? item.description || '' : item.descriptionFr || await translate(item.description || '');
        if (!french && description && !looksFrench(description)) {
          description = '';
        }
        let body = bodies[item.id] || '';
        if (!body) {
          const source = item.fullContent || (item.kind !== 'github' && item.kind !== 'youtube' && item.url ? await extract(item) : '') || '';
          if (source && source === item.description) {
            body = description;
          } else {
            body = french ? source : await translate(source);
          }
        }
        if (!french && body && !looksFrench(body)) {
          body = '';
        }
        if (!description && body) description = body.split(/\n\s*\n/)[0];
        if (!description) { pending.push(item.id); continue; }
        if (!body || body.length <= description.length) unavailable.push(item.id);
        ready[index] = {
          ...item, titleFr: stripMarkdownAndAsterisks(title),
          descriptionFr: stripMarkdownAndAsterisks(description),
          bodyFr: stripMarkdownAndAsterisks(body || description),
          contentState: body && body.length > description.length ? 'complete' : 'source-unavailable',
          prepared: true,
        };
      } catch {
        pending.push(item.id);
      } finally {
        onProgress(++completed, items.length);
      }
    }
  }));
  return { items: ready.filter(Boolean), unavailable, pending };
}

/** Only tracking parameters are disposable; content-identifying queries stay intact. */
export function canonicalNewsUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return String(value || '').trim(); }
}
