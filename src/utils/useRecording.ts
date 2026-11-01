import { useEffect, useState } from 'react';
import type { Piece } from '../types';
import type { Recording } from './player';
import { loadRecording, secondsAt, tickAt } from './recordings';
import { PPQ } from './score';

// The video's sound for a piece as something the player can follow, once it is there. Pieces from
// a backup or another device have none.
export function useRecording({ id, source, bpm }: Pick<Piece, 'id' | 'source' | 'bpm'>) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const moments = source?.moments;

  useEffect(() => {
    if (!moments?.length) return;
    let gone = false;
    let url = '';
    const audio = new Audio();
    void loadRecording(id).then(wav => {
      if (!wav || gone) return;
      url = URL.createObjectURL(wav);
      audio.src = url;
      audio.preload = 'auto';
      const perSecond = (bpm * PPQ) / 60;
      setRecording({
        play: (tick, speed) => {
          const go = () => { audio.currentTime = Math.max(0, secondsAt(moments, tick, perSecond)); };
          if (audio.readyState) go();
          else audio.addEventListener('loadedmetadata', go, { once: true });
          audio.playbackRate = speed;
          void audio.play();
        },
        pause: () => audio.pause(),
        at: () => tickAt(moments, audio.currentTime, perSecond),
        ended: () => audio.ended,
      });
    });
    return () => {
      gone = true;
      audio.pause();
      setRecording(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, moments, bpm]);

  return recording;
}
