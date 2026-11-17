import type { CSSProperties, ReactNode } from 'react';

// Small layout helpers that replace the most common inline flex/grid styles.
// Spacing goes through a CSS variable so the class stays the single source.
type Gap = 4 | 6 | 8 | 12 | 16 | 20 | 24;
const gapStyle = (gap?: Gap, extra?: Record<string, string>) =>
  (gap || extra ? { ...(gap ? { '--gap': `${gap}px` } : {}), ...extra } : undefined) as CSSProperties | undefined;

export function Stack({ gap, className, children }: { gap?: Gap; className?: string; children: ReactNode }) {
  return <div className={`stack${className ? ` ${className}` : ''}`} style={gapStyle(gap)}>{children}</div>;
}

export function Cluster({ gap, justify, className, children }: {
  gap?: Gap; justify?: 'between' | 'end'; className?: string; children: ReactNode;
}) {
  return <div className={['cluster', justify, className].filter(Boolean).join(' ')} style={gapStyle(gap)}>{children}</div>;
}

export function AutoGrid({ min = 220, gap, children }: { min?: number; gap?: Gap; children: ReactNode }) {
  return <div className="grid-auto" style={gapStyle(gap, { '--min': `${min}px` })}>{children}</div>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
