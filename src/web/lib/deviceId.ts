// The id the server minted for this browser. Sending it back on the next login
// is what keeps one browser to one device row instead of one row per login.
const KEY = 'spinecast.deviceId';

export const loadDeviceId = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const saveDeviceId = (id: string): void => {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage may be unavailable; the browser then mints a new device each login
  }
};
