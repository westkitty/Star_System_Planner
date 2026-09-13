/**
 * Accessible-modal behavior hook (UI11).
 *
 * Every planner modal gets: Escape-to-close, initial focus placement,
 * focus trapping while open, and background scroll-lock. One hook keeps
 * the eleven modals behaviorally consistent.
 */

import { useEffect, useRef } from 'react';
import { audioSynth } from '../audio/audio-synth';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  options: { closeOnEscape?: boolean; autoFocus?: boolean } = {}
): React.RefObject<T | null> {
  const { closeOnEscape = true, autoFocus = true } = options;
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ASSET07: every modal announces itself with tactile open/close ticks.
    audioSynth.playModalOpen();

    if (autoFocus) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? container).focus({ preventScroll: true });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      audioSynth.playModalClose();
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [closeOnEscape, autoFocus]);

  return containerRef;
}
