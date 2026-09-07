declare module '*/vendor/foliate-js/view.js' {
  export interface FoliateSection { id: unknown; linear?: string; size: number; createDocument(): Promise<Document> }
  export interface FoliateTocItem { label: string; href: string; subitems?: FoliateTocItem[] }
  export interface FoliateBook {
    sections: FoliateSection[];
    toc?: FoliateTocItem[];
    metadata?: { title?: string | Record<string, string> | null; author?: unknown };
    dir?: 'ltr' | 'rtl';
  }
  export interface FoliateContents {
    doc: Document;
    index: number;
    overlayer?: import('*/vendor/foliate-js/overlayer.js').Overlayer;
  }
  export interface FoliateRenderer extends HTMLElement {
    goTo(target: { index: number; anchor?: number | ((doc: Document) => Element | Range | null) }): Promise<void>;
    getContents(): FoliateContents[];
    setStyles?(css: string): void;
    prev(): Promise<void>;
    next(): Promise<void>;
  }
  export interface FoliateRelocateDetail {
    fraction: number;
    section?: { current: number; total: number };
    location?: { current: number; next: number; total: number };
    tocItem?: FoliateTocItem | null;
    range: Range;
  }
  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    isFixedLayout: boolean;
    open(book: Blob | string): Promise<void>;
    close(): void;
    goTo(target: number | string): Promise<unknown>;
    goToFraction(frac: number): Promise<void>;
    goToTextStart(): Promise<unknown>;
    getSectionFractions(): number[];
    prev(): Promise<void>;
    next(): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    getCFI(index: number, range?: Range): string;
    addAnnotation(annotation: { value: string; color?: string }, remove?: boolean): Promise<unknown>;
    deleteAnnotation(annotation: { value: string }): Promise<unknown>;
    showAnnotation(annotation: { value: string }): Promise<void>;
  }
}
declare module '*/vendor/foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight(rects: Iterable<DOMRect>, options?: { color?: string }): SVGElement;
    hitTest(event: { x: number; y: number }): [string, Range] | [];
  }
}
