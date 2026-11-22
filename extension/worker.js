chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  chrome.storage.session.set({ ['followed-' + tab.windowId]: tab.id }).catch(console.error);
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove('pdf-view-' + tabId).catch(console.error);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || (change.url && change.url !== chrome.runtime.getURL('viewer.html'))) {
    chrome.storage.session.remove('pdf-view-' + tabId).catch(console.error);
  }
});
