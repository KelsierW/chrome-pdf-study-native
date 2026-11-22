export function snapshotWebpage() {
  if (document.contentType === 'application/pdf') return null;
  const root = document.querySelector('main, article, [role="main"]') ?? document.body;
  if (!root) return '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !parent
        || parent.closest('script,style,header,footer,nav,aside,textarea,input,select,button,[contenteditable],[hidden],[aria-hidden="true"]')) {
        return NodeFilter.FILTER_REJECT;
      }
      const style = getComputedStyle(parent);
      return style.visibility === 'visible' && style.display !== 'none'
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const visible = rect => rect.bottom > 30 && rect.top < innerHeight
    && rect.right > 0 && rect.left < innerWidth && rect.width && rect.height;
  const inside = rect => rect.top >= 30 && rect.bottom <= innerHeight
    && rect.left >= 0 && rect.right <= innerWidth;
  const fragments = [];
  const words = new Intl.Segmenter(undefined, { granularity: 'word' });
  let length = 0;
  for (let i = 0, node; i < 9000 && length < 7800 && (node = walker.nextNode()); i++) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rectangles = [...range.getClientRects()].filter(rect => rect.width && rect.height);
    if (!rectangles.some(visible)) continue;
    let piece = '';
    if (rectangles.every(inside)) {
      piece = node.textContent;
    } else {
      for (const { index, segment } of words.segment(node.textContent)) {
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);
        if ([...range.getClientRects()].some(visible)) piece += segment;
        if (length + piece.length >= 7800) break;
      }
    }
    piece = piece.trim().slice(0, 7800 - length);
    if (piece) fragments.push(piece);
    length += piece.length;
  }
  return fragments.join('\n');
}
