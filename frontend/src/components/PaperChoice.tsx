import type { LetterPaper } from '../utils/letterPaper';

// Plain paper | Letterhead, for printing a letter
export default function PaperChoice({ paper, onChange }: { paper: LetterPaper; onChange: (next: LetterPaper) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Paper the letter is printed on">
      <button type="button" className={paper === 'plain' ? 'active' : ''} aria-pressed={paper === 'plain'}
        title="Print the company heading on a blank sheet" onClick={() => onChange('plain')}>Plain paper</button>
      <button type="button" className={paper === 'letterhead' ? 'active' : ''} aria-pressed={paper === 'letterhead'}
        title="Leave the heading blank for the company's printed letterhead" onClick={() => onChange('letterhead')}>Letterhead</button>
    </div>
  );
}
