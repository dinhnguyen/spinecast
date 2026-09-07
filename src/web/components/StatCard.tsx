export const StatCard = ({ label, value, hint, wide }: { label: string; value: string; hint?: string; wide?: boolean }) => (
  <div
    className={`flex flex-col gap-1 rounded-lg border border-border bg-surface p-5${
      // Five tiles in two columns leave the last one beside a gap.
      wide ? ' col-span-2 md:col-span-1' : ''
    }`}
  >
    <span className="text-[13px] font-semibold uppercase tracking-[.04em] text-muted">{label}</span>
    <span className="font-serif text-[26px] font-semibold tracking-[-.01em]">{value}</span>
    {hint ? <span className="text-[12.5px] text-faint">{hint}</span> : null}
  </div>
);
