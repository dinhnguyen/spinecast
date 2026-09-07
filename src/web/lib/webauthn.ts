// Tapping Cancel on the OS prompt is a normal outcome, not a failure, so it
// must not surface as an error. The browser library wraps the DOMException, so
// check the cause as well as the error itself.
export const isCeremonyCancel = (err: unknown): boolean => {
  const names = [(err as { name?: string } | null)?.name, (err as { cause?: { name?: string } } | null)?.cause?.name];
  return names.some((n) => n === 'NotAllowedError' || n === 'AbortError');
};
