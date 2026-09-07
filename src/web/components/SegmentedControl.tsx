interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
}

export const SegmentedControl = <T extends string>({ options, value, onChange, height = 36 }: SegmentedControlProps<T>) => (
  <div className="flex gap-[3px] rounded-lg bg-border p-[3px]">
    {options.map((o) => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ height: height - 6 }}
        className={`flex flex-1 items-center justify-center rounded-[6px] text-[14px] ${o.value === value ? 'bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'font-medium text-muted'}`}>
        {o.label}
      </button>
    ))}
  </div>
);
