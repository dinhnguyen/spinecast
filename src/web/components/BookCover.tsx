import type { BookDto } from '../../shared/apiTypes';

const COLORS = ['#5b6b4e', '#8a3b2e', '#3d5a6b', '#6b5a7a', '#2f4a5c', '#7a5c3a', '#4a4a3a', '#4e6b5b', '#5c4a3d', '#3a3a4a', '#6b4a5a', '#2e3d3a'];

const colorFor = (s: string): string => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
};

// Mockup covers are 166x236 (mobile) and 200x290 (desktop); one ratio for both keeps the
// grid tidy and the two are visually near-identical.
const ASPECT_RATIO = '166 / 236';

interface BookCoverProps {
  book: Pick<BookDto, 'id' | 'title' | 'author' | 'hasCover'>;
  fontSize: number;
}

export const BookCover = ({ book, fontSize }: BookCoverProps) => (
  <div style={{ aspectRatio: ASPECT_RATIO, background: colorFor(book.title), padding: '9%' }}
    className="relative flex w-full flex-col justify-end overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(42,37,31,.18),0_6px_14px_rgba(42,37,31,.12)]">
    {book.hasCover ? (
      <img src={`/api/books/${book.id}/cover`} alt="" className="absolute inset-0 h-full w-full object-cover" />
    ) : (
      <>
        <span style={{ width: 'max(3px, 4%)' }} className="absolute inset-y-0 left-0 bg-[rgba(0,0,0,.22)]" />
        <span style={{ fontSize }} className="font-serif font-semibold leading-[1.15] text-[rgba(255,250,240,.95)] text-pretty">{book.title}</span>
        <span style={{ fontSize: Math.round(fontSize * 0.68), marginTop: Math.round(fontSize * 0.3) }} className="text-[rgba(255,250,240,.72)]">{book.author}</span>
      </>
    )}
  </div>
);
