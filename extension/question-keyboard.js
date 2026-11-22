export function submitQuestionOnEnter(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
    || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat) event.currentTarget.form.requestSubmit();
}
