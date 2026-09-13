/**
 * Screen-reader live region (UI11).
 *
 * The canvas is silent to assistive tech; the announcer speaks for it —
 * selection changes, collisions, time-scale shifts, and branch switches
 * post polite live-region messages. Sighted users see nothing; screen
 * reader users get the play-by-play.
 */

import React, { useEffect, useState } from 'react';

type Listener = (message: string) => void;
let listener: Listener | null = null;
let lastMessage = '';

export function announce(message: string): void {
  lastMessage = message;
  listener?.(message);
}

export function lastAnnouncementForTests(): string {
  return lastMessage;
}

export const Announcer: React.FC = () => {
  const [message, setMessage] = useState('');
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    listener = (m: string) => {
      // Clear-then-set forces re-announcement of repeated messages.
      setMessage('');
      setPulse((p) => p + 1);
      setTimeout(() => setMessage(m), 30);
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div key={pulse} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
};
