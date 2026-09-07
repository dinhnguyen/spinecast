export const BucketBars = ({ labels, values }: { labels: string[]; values: number[] }) => {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-[90px] items-end gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="w-full rounded-t-[2px] bg-accent" style={{ height: `${Math.round(((values[i] ?? 0) / max) * 70)}px` }} />
          <span className="text-[12px] text-muted">{l}</span>
        </div>
      ))}
    </div>
  );
};
