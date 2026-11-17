import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon } from './Layout/nav';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

function classes(variant: ButtonVariant, size: ButtonSize, extra?: string) {
  return ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', extra || ''].filter(Boolean).join(' ');
}

function Inner({ icon, loading, children }: { icon?: string; loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {loading ? <span className="spinner-inline" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} className="btn-icon" /> : null}
      {children}
    </>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon-set name from Layout/nav ICON_PATHS. */
  icon?: string;
  loading?: boolean;
};

// The one button. Variants map onto the existing .btn-* classes so pages that
// still use raw class names render identically.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={classes(variant, size, className)}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      <Inner icon={icon} loading={loading}>{children}</Inner>
    </button>
  );
});

// Same look, for navigation.
export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }:
  LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: string }) {
  return (
    <Link className={classes(variant, size, className)} {...rest}>
      <Inner icon={icon}>{children}</Inner>
    </Link>
  );
}
