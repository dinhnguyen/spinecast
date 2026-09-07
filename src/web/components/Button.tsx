import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../lib/icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'primary' | 'ghost' | 'surface';
  icon?: IconName;
  height?: number;
  children: ReactNode;
}

const KIND: Record<NonNullable<ButtonProps['kind']>, string> = {
  primary: 'bg-accent text-on-accent border-accent',
  ghost: 'bg-transparent text-ink border-control',
  surface: 'bg-surface text-ink border-control',
};

export const Button = ({ kind = 'primary', icon, height = 44, className = '', children, ...rest }: ButtonProps) => (
  <button
    {...rest}
    style={{ height, ...rest.style }}
    // focus-visible, not focus: the ring is for keyboard traversal and should not
    // appear on a mouse press. A ring (box-shadow) rather than an outline, because
    // outline-none pins outline-style to none and outline-2 only sets the width -
    // the ring would compute a colour and never paint. The offset matters as much
    // as the ring: an accent ring hugging the accent-filled primary button is the
    // same colour as the fill and disappears.
    className={`inline-flex items-center justify-center gap-2 rounded-[6px] border px-[18px] font-sans text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60 ${KIND[kind]} ${className}`}
  >
    {icon ? <Icon name={icon} size={18} /> : null}
    <span>{children}</span>
  </button>
);
