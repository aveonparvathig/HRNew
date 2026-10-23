import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

// Shared form pieces of the forms-and-reports design: a numbered, anchored
// section list; section cards; a field wrapper with the label above, helper
// text and an error line; card-style checkbox rows; and the bottom bar that
// lists what is still empty. Styles: "Forms & reports kit" in index.css.

export interface FormSectionDef { id: string; label: string }

// The layout: anchors on the left (above the form on a phone) and the
// sections on the right. `scrollRoot` is the element that scrolls (a modal
// or the window) so the active anchor follows the reader.
export function SectionedForm({ sections, children, note }: {
  sections: FormSectionDef[]; children: ReactNode; note?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(sections[0]?.id || '');

  // The section nearest the top of the scrolling area is the active one
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const scroller: HTMLElement | Window = (host.closest('.modal') as HTMLElement | null) || window;
    const update = () => {
      const top = scroller instanceof Window ? 0 : scroller.getBoundingClientRect().top;
      let best = sections[0]?.id || '';
      for (const s of sections) {
        const el = host.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - top <= 120) best = s.id;
      }
      setActive(best);
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [sections]);

  const jump = (id: string) => {
    const el = ref.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <div className="form-layout" ref={ref}>
      <nav className="form-anchors" aria-label="Form sections">
        {sections.map((s, i) => (
          <button key={s.id} type="button" className={`anchor${active === s.id ? ' on' : ''}`} onClick={() => jump(s.id)}>
            <span className="anchor-no">{i + 1}</span>{s.label}
          </button>
        ))}
        {note && <p className="anchor-note">{note}</p>}
      </nav>
      <div className="form-sections">{children}</div>
    </div>
  );
}

export function SectionCard({ id, title, description, children, aside }: {
  id: string; title: ReactNode; description?: ReactNode; children: ReactNode; aside?: ReactNode;
}) {
  return (
    <section className="sec-card" id={id}>
      <div className="sec-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Two columns on a desktop, one on a phone
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="field-grid">{children}</div>;
}

// Label above the control, optional helper text and error, `full` spans the grid
export function Field({ label, htmlFor, required, help, error, full, children, right }: {
  label: ReactNode; htmlFor?: string; required?: boolean; help?: ReactNode; error?: ReactNode;
  full?: boolean; children: ReactNode; right?: ReactNode;
}) {
  return (
    <div className={`f${full ? ' full' : ''}`}>
      <div className="lbl-row">
        <label className="lbl" htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
        {right}
      </div>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

// A checkbox drawn as a card with a title and a line of help
export function CheckCard({ checked, onChange, title, help, disabled }: {
  checked: boolean; onChange: (checked: boolean) => void; title: ReactNode; help?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className={`sw${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="sw-text">
        <span className="sw-title">{title}</span>
        {help && <span className="help">{help}</span>}
      </span>
    </label>
  );
}

// The bar at the foot of a long form: what is still empty, then the buttons
export function FormFootBar({ missing, children, blocking }: {
  missing: string[]; children: ReactNode; blocking?: string[];
}) {
  const text = blocking && blocking.length > 0
    ? `Required: ${blocking.join(', ')}.`
    : missing.length === 0 ? 'Everything needed for payroll is filled in.'
      : `${missing.length} field${missing.length === 1 ? '' : 's'} still empty: ${missing.join(', ')}.`;
  return (
    <div className="form-foot">
      <span className={`form-foot-text${blocking && blocking.length ? ' is-blocking' : ''}`}>{text}</span>
      <div className="form-foot-actions">{children}</div>
    </div>
  );
}
