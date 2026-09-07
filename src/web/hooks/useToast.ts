import { createElement, useCallback, useRef, useState, type ReactNode } from 'react';

export const useToast = (): { toast: ReactNode; show: (msg: string) => void } => {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    timeoutRef.current = setTimeout(() => setMessage(null), 4000);
  }, []);

  const toast = message
    ? createElement(
        'div',
        { className: 'fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-dark px-4 py-2.5 text-[14px] text-[#f1eadf]' },
        message,
      )
    : null;

  return { toast, show };
};
