import { useT } from '../i18n/LocaleProvider';

interface StepperProps {
  label: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
}

export const Stepper = ({ label, display, onDecrement, onIncrement }: StepperProps) => {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px] font-medium">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-control">
        <button type="button" onClick={onDecrement} aria-label={t('display.decrease', { label })} className="flex h-10 w-11 items-center justify-center border-r border-control text-lg">−</button>
        <span className="min-w-14 text-center text-[14px] font-semibold">{display}</span>
        <button type="button" onClick={onIncrement} aria-label={t('display.increase', { label })} className="flex h-10 w-11 items-center justify-center border-l border-control text-lg">+</button>
      </div>
    </div>
  );
};
