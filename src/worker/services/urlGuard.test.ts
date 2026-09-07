import { describe, expect, it } from 'vitest';
import { isBlockedHost } from './urlGuard';

describe('isBlockedHost', () => {
  it('blocks loopback, private ranges and cloud metadata', () => {
    for (const h of ['localhost', '::1', '[::1]', '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1', '169.254.169.254', '0.0.0.0'])
      expect(isBlockedHost(h)).toBe(true);
  });

  it('allows ordinary public hosts and public ip ranges', () => {
    for (const h of ['books.example.org', 'standardebooks.org', '8.8.8.8', '172.32.0.1', '11.0.0.1']) expect(isBlockedHost(h)).toBe(false);
  });

  it('allows the worker own host even when it would otherwise be blocked', () => {
    expect(isBlockedHost('localhost', 'localhost')).toBe(false);
    expect(isBlockedHost('LOCALHOST', 'localhost')).toBe(false);
    expect(isBlockedHost('127.0.0.1', 'localhost')).toBe(true);
    // IP literals are blocked unconditionally, even as selfHostname
    expect(isBlockedHost('127.0.0.1', '127.0.0.1')).toBe(true);
    expect(isBlockedHost('169.254.169.254', '169.254.169.254')).toBe(true);
    expect(isBlockedHost('10.0.0.5', '10.0.0.5')).toBe(true);
    expect(isBlockedHost('::1', '::1')).toBe(true);
    expect(isBlockedHost('[::1]', '[::1]')).toBe(true);
    // Public hostnames are still rescued
    expect(isBlockedHost('books.example.org', 'books.example.org')).toBe(false);
  });
});
