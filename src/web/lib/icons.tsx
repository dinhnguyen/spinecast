import {
  AlignLeft,
  Bookmark,
  ChartColumn,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Copy,
  EllipsisVertical,
  Eye,
  Grid,
  Highlighter,
  KeyRound,
  Library,
  List,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TextInitial,
  Share,
  Square,
  TriangleAlert,
  Upload,
  User,
  X,
} from 'lucide';

// Lucide's own icons, under the names this app already uses at 22 call sites.
// A few pick the variant closest to what the artboards drew: AlignLeft over List
// (no bullets), Share over Share2 (an arrow, not a network), CloudDownload over
// Cloud (the OPDS tab pulls books down), and TextInitial for the reader's type
// controls - a drop cap reads as typography where a plain T reads as text entry.
// `list` (AlignLeft) is already taken by the reader's TOC button, so the library's
// view toggle uses `rows` (List, the bulleted one) instead.
export const ICONS = {
  upload: Upload,
  list: AlignLeft,
  type: TextInitial,
  gear: Settings,
  back: ChevronLeft,
  sync: RefreshCw,
  check: Check,
  alert: TriangleAlert,
  bookmark: Bookmark,
  highlight: Highlighter,
  chev: ChevronRight,
  library: Library,
  chart: ChartColumn,
  user: User,
  eye: Eye,
  search: Search,
  plus: Plus,
  copy: Copy,
  x: X,
  logout: LogOut,
  more: EllipsisVertical,
  share: Share,
  cloud: CloudDownload,
  key: KeyRound,
  grid: Grid,
  rows: List,
  square: Square,
  checkSquare: CheckSquare,
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

// 1.75 rather than Lucide's default 2: the paper palette reads lighter, and the
// artboards were drawn at this weight.
export const Icon = ({ name, size = 22, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {ICONS[name].map(([Tag, attrs], i) => (
      <Tag key={i} {...attrs} />
    ))}
  </svg>
);
