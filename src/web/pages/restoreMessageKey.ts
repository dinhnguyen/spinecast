import type { ProgressDto } from '../../shared/apiTypes';
import type { RestoreResult } from '../reader/positionBridge';

// A restore can carry two messages: the position may be approximate, and it may
// have come from another device. Only one toast can show at a time (`useToast`
// holds a single slot), and the approximate warning wins - it carries a caveat
// the reader may need to act on, while the device toast is purely informational.
export const restoreMessageKey = (
  local: ProgressDto | null,
  result: RestoreResult | null,
  userDeviceId: string | null | undefined,
): 'reader.approxPosition' | 'reader.otherDevice' | null => {
  if (result !== null && result !== 'xpath' && local?.xpath) return 'reader.approxPosition';
  if (local?.deviceId && local.deviceId !== userDeviceId) return 'reader.otherDevice';
  return null;
};
