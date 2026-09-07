interface RadioOptionProps {
  label: string;
  description?: string;
  checked: boolean;
  onSelect: () => void;
}

export const RadioOption = ({ label, description, checked, onSelect }: RadioOptionProps) => (
  <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="flex items-start gap-2.5 py-2.5 text-left">
    <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${checked ? 'border-accent' : 'border-faint'}`}>
      {checked ? <span className="h-[9px] w-[9px] rounded-full bg-accent" /> : null}
    </span>
    <span className="flex flex-col gap-0.5">
      <span className="text-[15px] font-medium">{label}</span>
      {description ? <span className="text-[13px] text-muted">{description}</span> : null}
    </span>
  </button>
);
