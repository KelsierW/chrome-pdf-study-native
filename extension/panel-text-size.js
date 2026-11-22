const sizes = [90, 100, 115, 130, 145, 160];
const key = 'panelTextSize';
const controls = document.querySelectorAll('.text-size button');
const label = document.querySelector('#panel-text-size');
const stored = (await chrome.storage.local.get(key).catch(() => ({})))[key];
let position = sizes.includes(stored) ? sizes.indexOf(stored) : sizes.indexOf(100);

function applySize() {
  const size = sizes[position];
  document.documentElement.style.setProperty('--panel-text-scale', String(size / 100));
  label.textContent = size + '%';
  controls[0].disabled = position === 0;
  controls[1].disabled = position === sizes.length - 1;
}

for (const [index, direction] of [-1, 1].entries()) {
  controls[index].addEventListener('click', () => {
    const next = position + direction;
    if (next < 0 || next >= sizes.length) return;
    position = next;
    applySize();
    void chrome.storage.local.set({ [key]: sizes[position] }).catch(() => {});
  });
}
applySize();
