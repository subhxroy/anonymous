import React, { useState, useEffect, useCallback, useRef } from 'react';
import FakeCalculator from '../pages/FakeCalculator';

interface PanicModeProps {
  children: React.ReactNode;
}

export default function PanicMode({ children }: PanicModeProps) {
  const [isPanic, setIsPanic] = useState(false);
  const escPressTimesRef = useRef<number[]>([]);

  const isPanicRef = useRef(isPanic);

  useEffect(() => {
    isPanicRef.current = isPanic;
  }, [isPanic]);

  const triggerPanic = useCallback(() => {
    setIsPanic(true);
    // Blur any active input so there's no flash of content
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const dismissPanic = useCallback(() => {
    setIsPanic(false);
    escPressTimesRef.current = [];
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const panicActive = isPanicRef.current;
      // If already in panic, ESC×2 dismisses
      if (panicActive) {
        if (e.key === 'Escape') {
          const now = Date.now();
          const recent = escPressTimesRef.current.filter(t => now - t < 600);
          recent.push(now);
          escPressTimesRef.current = recent;
          if (recent.length >= 2) {
            dismissPanic();
          }
        }
        return;
      }

      // Normal mode: ESC×2 to trigger panic
      if (e.key === 'Escape') {
        const now = Date.now();
        const recent = escPressTimesRef.current.filter(t => now - t < 600);
        recent.push(now);
        escPressTimesRef.current = recent;
        if (recent.length >= 2) {
          triggerPanic();
        }
      } else {
        // Any other key resets the ESC counter
        escPressTimesRef.current = [];
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [triggerPanic, dismissPanic]);

  if (isPanic) {
    return <FakeCalculator onDismiss={dismissPanic} />;
  }

  return <>{children}</>;
}
