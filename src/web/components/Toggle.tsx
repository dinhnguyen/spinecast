interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

export const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
    className={`relative h-[26px] w-[44px] shrink-0 rounded-[13px] transition-colors ${checked ? 'bg-accent' : 'bg-border ring-1 ring-control'}`}>
    <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${checked ? 'right-[3px]' : 'left-[3px]'}`} />
  </button>
);
