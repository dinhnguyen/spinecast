import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeviceDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { DeviceRow } from './DeviceRow';

const baseDevice: DeviceDto = {
  id: 'dev-1',
  name: 'Chrome · macOS',
  createdAt: 0,
  lastSeenAt: 0,
  current: false,
};

describe('DeviceRow', () => {
  it('resyncs the rename draft to the latest device name when reopening the editor', () => {
    const { rerender } = render(
      <LocaleProvider initial="en">
        <DeviceRow device={baseDevice} busy={false} onRename={async () => {}} onRemove={async () => {}} />
      </LocaleProvider>,
    );

    // Simulate another session's rename landing via reload() while this row is not in edit mode.
    rerender(
      <LocaleProvider initial="en">
        <DeviceRow device={{ ...baseDevice, name: 'Laptop' }} busy={false} onRename={async () => {}} onRemove={async () => {}} />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByText('Rename'));

    expect((screen.getByLabelText('Device name') as HTMLInputElement).value).toBe('Laptop');
  });
});
