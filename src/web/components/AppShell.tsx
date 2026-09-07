import type { ReactNode } from 'react';
import { DesktopNav } from './DesktopNav';
import { MobileTabBar } from './MobileTabBar';

interface AppShellProps {
  onUpload?: () => void;
  syncBadge: ReactNode;
  children: ReactNode;
}

export const AppShell = ({ onUpload, syncBadge, children }: AppShellProps) => (
  <div className="flex h-full flex-col">
    <DesktopNav onUpload={onUpload} syncBadge={syncBadge} />
    <div className="flex-1 overflow-y-auto">{children}</div>
    <MobileTabBar />
  </div>
);
