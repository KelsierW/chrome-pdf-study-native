const terms = new Intl.Segmenter(['zh-Hant', 'en'], { granularity: 'word' });
const stop = new Set('the and this that these from with into when then which have does what how why explain could would will should page chapter problem following question about 請問 為什麼 什麼 如何 這裡 這頁 說明'.split(' '));

function tokenize(value) {
  const lower = value.normalize('NFKC').toLowerCase();
  const words = new Set();
  for (const item of terms.segment(lower)) {
    const word = item.segment.replace(/(?:ing|es|s)$/u, '');
    if (item.isWordLike && word.length > 1 && !/^\d+$/u.test(word) && !stop.has(item.segment)) words.add(word);
  }
  for (const alias of value.matchAll(/\b([A-Za-z][A-Za-z -]{3,55})\s+\(([A-Z]{2,8})\)/gu)) {
    words.add(alias[2].toLowerCase());
  }
  return words;
}

export function findReferences(context, passages, limit = 12) {
  const query = tokenize(context.slice(0, 12000));
  if (!query.size || !passages.length) return [];
  const frequency = new Map();
  const matches = passages.map(item => {
    const words = [...tokenize(item.text)].filter(word => query.has(word));
    for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    return { item, words };
  });
  const ranked = matches.map(({ item, words }) => ({
    item, score: words.reduce((total, word) => total + Math.log(1 + passages.length / frequency.get(word)), 0)
  })).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
  const years = new Set();
  const preferred = ranked.filter(({ item }) => {
    if (!item.year || years.has(item.year)) return false;
    years.add(item.year);
    return true;
  }).slice(0, Math.ceil(limit / 2));
  return [...new Set([...preferred, ...ranked])].slice(0, limit).map(({ item }) => item);
}
