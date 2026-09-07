export const ProgressBar = ({ percent, done = false }: { percent: number; done?: boolean }) => (
  <div className="h-[3px] w-full overflow-hidden rounded-[2px] bg-border">
    <div className={`h-[3px] ${done ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
  </div>
);
