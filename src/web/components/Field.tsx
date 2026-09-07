import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  mono?: boolean;
  height?: number;
}

export const Field = ({ label, hint, mono = false, height = 46, className = '', ...rest }: FieldProps) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[13px] font-semibold tracking-[.01em] text-muted">{label}</span>
    <input
      {...rest}
      style={{ height }}
      className={`rounded-[6px] border border-control bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_#f0e5d6] read-only:text-muted ${mono ? 'font-mono text-[14px]' : ''} ${className}`}
    />
    {hint ? <span className="text-[12.5px] text-faint">{hint}</span> : null}
  </label>
);
