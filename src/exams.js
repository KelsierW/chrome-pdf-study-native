export function parseExam({ pages }) {
  const questions = [];
  const unassigned = [];
  let question;
  let lastNumber = 0;
  let baseIndent = Infinity;

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    const preamble = [];
    for (const line of page.split(/\r?\n/u)) {
      const explicit = line.match(/^\s*(?:(?:Q(?:uestion)?\s*#?\s*)(\d+)\b|第\s*(\d+)\s*題)/iu);
      const bare = line.match(/^([ \t]*)(\d{1,2})[.)、](?:[ \t]|$)/u);
      const number = Number(explicit?.[1] ?? explicit?.[2] ?? bare?.[2]);
      const scored = line.match(/^\s*([^\s]{1,3})[.)、]\s*\[\s*(?:[Cc]\s*)?\d/u);
      const rubric = scored && bare && number <= lastNumber + 2;
      const sequential = bare && number === lastNumber + 1 && bare[1].length <= baseIndent;
      if (number > lastNumber && (explicit || rubric || sequential)) {
        baseIndent = Math.min(baseIndent, line.length - line.trimStart().length);
        question = { number: String(number), startPage: pageNumber, endPage: pageNumber, lines: [] };
        questions.push(question);
        lastNumber = number;
      } else if (scored && !/^[a-z]$/iu.test(scored[1])) {
        question = undefined;
      }
      if (question) {
        question.lines.push(line);
        if (line.trim()) question.endPage = pageNumber;
      } else {
        preamble.push(line);
      }
    }
    if (preamble.some(line => line.trim())) unassigned.push({ page: pageNumber, text: preamble.join('\n') });
  }

  return {
    questions: questions.map(({ lines, ...metadata }) => ({ ...metadata, text: lines.join('\n').trim() })),
    unassigned
  };
}
