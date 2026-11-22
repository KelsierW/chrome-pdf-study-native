const encoder = new TextEncoder();

export function parsePdfToolbar(text) {
  const matches = text.matchAll(/\b(\d{1,5})\s*(?:[/／]|\bof\b)\s*(\d{1,5})(?!\d)/giu);
  for (const [, page, total] of matches) {
    if (Number(page) > 0 && Number(page) <= Number(total)) return Number(page);
  }
  return null;
}

export function nativePageKey(page, signature) {
  // shortcut: an unreadable toolbar uses the exact frame, upgrade when Chrome exposes the page number.
  return page ?? Number.parseInt(signature.slice(0, 12), 16) + 100001;
}

export function nativePdfReader(fingerprint, startOcr) {
  let previous;
  let worker;
  let focusRevision = 0;
  chrome.tabs.onActivated.addListener(() => { focusRevision++; });

  return async function readNativePdf(tab, windowId) {
    const revision = focusRevision;
    const image = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 82 });
    const [active] = await chrome.tabs.query({ windowId, active: true });
    if (revision !== focusRevision || active?.id !== tab.id || active.url !== tab.url) return;
    const url = tab.url.split('#')[0];
    if (previous?.image !== image || previous.url !== url) {
      previous = { image, url };
      return;
    }
    if (previous.result) return previous.result;

    const bitmap = new Image();
    bitmap.src = image;
    await bitmap.decode();
    const dpi = bitmap.naturalWidth / (tab.width || bitmap.naturalWidth);
    const toolbar = Math.min(bitmap.naturalHeight - 1, Math.round(66 * dpi));
    const body = document.createElement('canvas');
    const bodyHeight = bitmap.naturalHeight - toolbar;
    const scale = Math.min(1, 1660 / bitmap.naturalWidth, 1660 / bodyHeight);
    body.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
    body.height = Math.max(1, Math.round(bodyHeight * scale));
    body.getContext('2d').drawImage(bitmap, 0, toolbar, bitmap.naturalWidth, bodyHeight,
      0, 0, body.width, body.height);

    let page = null;
    let text = '';
    try {
      worker ??= startOcr();
      const ocr = await worker;
      if (toolbar > 0) {
        const header = document.createElement('canvas');
        header.width = Math.round(bitmap.naturalWidth * 1.6);
        header.height = Math.round(toolbar * 1.6);
        header.getContext('2d').drawImage(bitmap, 0, 0, bitmap.naturalWidth, toolbar,
          0, 0, header.width, header.height);
        await ocr.setParameters({ tessedit_pageseg_mode: '11' });
        page = parsePdfToolbar((await ocr.recognize(header)).data.text);
      }
      await ocr.setParameters({ tessedit_pageseg_mode: '3' });
      text = (await ocr.recognize(body)).data.text.trim().slice(0, 8000);
    } catch (error) {
      console.warn('PDF 畫面 OCR 暫時無法使用。', error.message);
      void worker?.then(active => active.terminate()).catch(() => {});
      worker = undefined;
    }
    const cropped = body.toDataURL('image/jpeg', .77);
    const [documentFingerprint, frame] = await Promise.all([
      fingerprint(encoder.encode('native-pdf:' + url)), fingerprint(encoder.encode(cropped))
    ]);
    const [stillActive] = await chrome.tabs.query({ windowId, active: true });
    if (revision !== focusRevision || stillActive?.id !== tab.id || stillActive.url !== tab.url) return;
    return previous.result = {
      documentFingerprint, page: nativePageKey(page, frame), nativePage: page,
      title: tab.title ?? 'Chrome PDF', image: cropped, text, nativePdf: true
    };
  };
}
