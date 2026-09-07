import { describe, expect, it } from 'vitest';
import { deviceNameFromUserAgent } from './deviceName';

describe('deviceNameFromUserAgent', () => {
  it('names a desktop browser as browser and system', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome · macOS');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')).toBe('Edge · Windows');
  });

  it('names iOS browsers by their real engine wrapper', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1')).toBe('Chrome · iOS');
  });

  it('names a plain Safari on macOS', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe('Safari · macOS');
  });

  it('names an e-ink reader before matching its Linux token', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Linux; U; Android 4.0.4; Kobo Touch) AppleWebKit/534.30')).toBe('E-ink');
  });

  it('falls back when the agent is missing or unknown', () => {
    expect(deviceNameFromUserAgent(null)).toBe('Spinecast');
    expect(deviceNameFromUserAgent('curl/8.4.0')).toBe('Spinecast');
  });
});
