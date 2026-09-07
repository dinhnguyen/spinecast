export const CLIPPING_TEXT_MAX = 2048;
export const CLIPPING_NOTE_MAX = 4096;
export const CLIPPING_CHAPTER_MAX = 64;
export const CLIPPING_CFI_MAX = 512;

// The server does not define a colour format; Spinecast is the first writer and
// stores lowercase hex so a later firmware needs no name table.
export const HIGHLIGHT_COLORS = ['#f4e3a1', '#cfe3b8', '#f3c9b8', '#cbdcf0'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const isHighlightColor = (v: unknown): v is HighlightColor =>
  typeof v === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(v);
