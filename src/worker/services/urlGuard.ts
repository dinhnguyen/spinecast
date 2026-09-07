// The Worker's own origin is allowed through: Spinecast's OPDS catalog is a
// valid OPDS catalog, so a user can add a source pointing back at Spinecast.
// That origin is already public, so nothing is given away. IP literals (IPv4 and
// IPv6 loopback) are excluded from this exception to prevent spoofing via the Host header.
export const isBlockedHost = (hostname: string, selfHostname?: string): boolean => {
  const h = hostname.toLowerCase();
  const parts = h.split('.');
  const isIPv4Literal = parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
  const isIPLiteral = isIPv4Literal || h === '::1' || h === '[::1]';

  // Self-origin exception applies only to non-IP hostnames
  if (selfHostname && !isIPLiteral && h === selfHostname.toLowerCase()) return false;

  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;

  if (isIPv4Literal) {
    const [a, b] = parts.map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b! >= 16 && b! <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 0) return true; // "this network"
  }
  return false;
};
