export const DEVICE_NAME_MAX = 64;
export const DEVICE_NAME_FALLBACK = 'Spinecast';

// Ordered: every later entry's token appears in the earlier agents too.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg[A-Z]?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bCriOS\//, 'Chrome'],
  [/\bFxiOS\//, 'Firefox'],
  [/\bFirefox\//, 'Firefox'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/\bKobo\b|\bKindle\b|\breMarkable\b|\bPocketBook\b/, 'E-ink'],
  [/\biPhone\b|\biPad\b|\biPod\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
];

const firstMatch = (pairs: [RegExp, string][], ua: string): string | null =>
  pairs.find(([re]) => re.test(ua))?.[1] ?? null;

export const deviceNameFromUserAgent = (ua: string | null): string => {
  if (!ua) return DEVICE_NAME_FALLBACK;
  const system = firstMatch(SYSTEMS, ua);
  // An e-ink reader is identified by the hardware alone; its browser token is noise.
  if (system === 'E-ink') return system;
  const browser = firstMatch(BROWSERS, ua);
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? DEVICE_NAME_FALLBACK;
};
