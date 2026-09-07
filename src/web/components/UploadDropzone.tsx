import { useRef, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
}

export const UploadDropzone = ({ onFiles }: UploadDropzoneProps) => {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.epub'));
    if (files.length) onFiles(files);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`hidden cursor-pointer items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed px-[18px] py-3.5 text-[14px] text-muted md:flex ${dragging ? 'border-accent bg-accent-soft' : 'border-border bg-[rgba(255,253,248,.6)]'}`}
    >
      <Icon name="upload" size={18} className="text-accent" />
      <span>
        {t('library.dropzoneBefore')} <b className="text-ink">.epub</b> {t('library.dropzoneAfter')}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".epub"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};
