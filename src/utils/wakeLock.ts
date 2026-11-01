import { useEffect } from 'react';

// Both hands are on the keys, nobody touches the screen: it has to stay on. The browser drops the
// lock whenever the app goes to the background, so it is asked for again on the way back.
export function useScreenAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let left = false;
    const ask = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock?.request('screen');
        if (left) void next?.release();
        else lock = next ?? null;
      } catch {
        // Not allowed or not there: the screen goes dark as it always does
      }
    };
    void ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      left = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release();
    };
  }, []);
}
