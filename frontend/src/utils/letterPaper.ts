import { useState } from 'react';

// The paper a letter is printed on. Plain paper prints the company heading;
// the company's printed letterhead already has it, so the letter leaves
// its space blank. Remembered in this browser, for the letter form and
// the letter page alike.
export type LetterPaper = 'plain' | 'letterhead';

const KEY = 'letterPaper';

const stored = (): LetterPaper => {
  try { return localStorage.getItem(KEY) === 'letterhead' ? 'letterhead' : 'plain'; } catch { return 'plain'; }
};

export function useLetterPaper(): [LetterPaper, (next: LetterPaper) => void] {
  const [paper, setPaper] = useState<LetterPaper>(stored);
  const choose = (next: LetterPaper) => {
    setPaper(next);
    try { localStorage.setItem(KEY, next); } catch { /* remembered for this visit only */ }
  };
  return [paper, choose];
}
