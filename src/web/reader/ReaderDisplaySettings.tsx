import { BottomSheet } from '../components/BottomSheet';
import { SegmentedControl } from '../components/SegmentedControl';
import { Stepper } from '../components/Stepper';
import { useT } from '../i18n/LocaleProvider';
import { isMessageKey, type MessageKey } from '../i18n/messages';
import { themeColors, type ReaderSettings } from './readerSettings';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const MARGIN_ORDER: ReaderSettings['margin'][] = ['hep', 'vua', 'rong'];
const MARGIN_LABEL: Record<ReaderSettings['margin'], MessageKey> = {
  hep: 'display.marginNarrow',
  vua: 'display.marginMedium',
  rong: 'display.marginWide',
};

const FONT_OPTIONS: { value: 'serif' | 'sans' | 'goc'; label: MessageKey | 'Serif' | 'Sans' }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'goc', label: 'display.fontOriginal' },
];

const FLOW_OPTIONS = [
  { value: 'paginated' as const, label: 'display.paginated' as const },
  { value: 'scrolled' as const, label: 'display.scrolled' as const },
];

const THEME_OPTIONS = [
  { value: 'sang' as const, label: 'display.themeLight' as const },
  { value: 'giay' as const, label: 'display.themePaper' as const },
  { value: 'toi' as const, label: 'display.themeDark' as const },
];

interface ReaderDisplaySettingsProps {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
}

const cycleMargin = (current: ReaderSettings['margin'], dir: 1 | -1): ReaderSettings['margin'] => {
  const i = MARGIN_ORDER.indexOf(current);
  return MARGIN_ORDER[(i + dir + MARGIN_ORDER.length) % MARGIN_ORDER.length]!;
};

const ThemeSwatches = ({ value, onChange, gap }: { value: ReaderSettings['theme']; onChange: (t: ReaderSettings['theme']) => void; gap: number }) => {
  const { t } = useT();
  return (
    <div className="flex" style={{ gap }}>
      {THEME_OPTIONS.map((opt) => {
        const { bg, fg } = themeColors(opt.value);
        const selected = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              style={{ background: bg, color: fg, borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)' }}
              className="flex h-14 w-full items-center justify-center rounded-lg border-2 font-serif text-[20px]"
            >
              Aa
            </span>
            <span className={`text-[12.5px] ${selected ? 'font-semibold text-accent-ink' : 'font-medium text-muted'}`}>{t(opt.label)}</span>
          </button>
        );
      })}
    </div>
  );
};

export const ReaderDisplaySettings = ({ open, onClose, settings, onChange }: ReaderDisplaySettingsProps) => {
  const { t } = useT();
  if (!open) return null;

  const setFontSize = (d: number) => onChange({ ...settings, fontSize: Math.min(32, Math.max(12, round1(settings.fontSize + d))) });
  const setLineHeight = (d: number) => onChange({ ...settings, lineHeight: Math.min(2.2, Math.max(1.2, round1(settings.lineHeight + d))) });
  const setMargin = (dir: 1 | -1) => onChange({ ...settings, margin: cycleMargin(settings.margin, dir) });
  const fontOptions = FONT_OPTIONS.map((o) => ({ value: o.value, label: isMessageKey(o.label) ? t(o.label) : o.label }));
  const flowOptions = FLOW_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }));

  return (
    <>
      <div className="md:hidden">
        <BottomSheet open={open} onClose={onClose} title={t('display.title')} height={470}>
          <div className="flex flex-col gap-[18px]">
            <Stepper label={t('display.fontSize')} display={String(settings.fontSize)} onDecrement={() => setFontSize(-0.5)} onIncrement={() => setFontSize(0.5)} />
            <Stepper label={t('display.lineHeight')} display={String(settings.lineHeight)} onDecrement={() => setLineHeight(-0.1)} onIncrement={() => setLineHeight(0.1)} />
            <Stepper label={t('display.margin')} display={t(MARGIN_LABEL[settings.margin])} onDecrement={() => setMargin(-1)} onIncrement={() => setMargin(1)} />
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">{t('display.font')}</span>
              <div className="w-[196px]">
                <SegmentedControl options={fontOptions} value={settings.font} onChange={(font) => onChange({ ...settings, font })} height={40} />
              </div>
            </div>
            <ThemeSwatches value={settings.theme} onChange={(theme) => onChange({ ...settings, theme })} gap={12} />
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium">{t('display.flow')}</span>
              <div className="w-[196px]">
                <SegmentedControl options={flowOptions} value={settings.flow} onChange={(flow) => onChange({ ...settings, flow })} height={40} />
              </div>
            </div>
          </div>
        </BottomSheet>
      </div>

      <div className="absolute top-2 right-4 z-30 hidden w-[340px] flex-col gap-4 rounded-[10px] border border-border bg-surface p-[18px] shadow-[0_12px_32px_rgba(42,37,31,.16)] md:flex">
        <Stepper label={t('display.fontSize')} display={String(settings.fontSize)} onDecrement={() => setFontSize(-0.5)} onIncrement={() => setFontSize(0.5)} />
        <Stepper label={t('display.lineHeight')} display={String(settings.lineHeight)} onDecrement={() => setLineHeight(-0.1)} onIncrement={() => setLineHeight(0.1)} />
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">{t('display.font')}</span>
          <div className="w-[180px]">
            <SegmentedControl options={fontOptions} value={settings.font} onChange={(font) => onChange({ ...settings, font })} height={36} />
          </div>
        </div>
        <ThemeSwatches value={settings.theme} onChange={(theme) => onChange({ ...settings, theme })} gap={10} />
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">{t('display.flow')}</span>
          <div className="w-[180px]">
            <SegmentedControl options={flowOptions} value={settings.flow} onChange={(flow) => onChange({ ...settings, flow })} height={36} />
          </div>
        </div>
      </div>
    </>
  );
};
