import { useMemo, useRef, useState } from 'react';
import { BUTTON, BUTTON_GHOST, Chip, KICKER, TEXT_BUTTON } from '../components/ui';
import type { Piece } from '../types';
import { barTicks, handTicks } from '../utils/score';
import { VideoError, readVideo } from '../video/readVideo';
import { writeDown } from '../video/rhythm';
import type { Detected } from '../video/tracker';

type Fields = Pick<Piece, 'beats' | 'beatValue' | 'key' | 'bpm' | 'hands'>;
const OCTAVES = [-2, -1, 0, 1, 2];

export function Import({ onCreate, onCancel }: { onCreate: (title: string, fields: Fields) => void; onCancel: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ notes: Detected[]; fullKeyboard: boolean } | null>(null);
  const [title, setTitle] = useState('');
  const [octave, setOctave] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1);
  const input = useRef<HTMLInputElement>(null);

  const reading = useMemo(() => (result ? writeDown(result.notes, { octave, tempoFactor }) : null), [result, octave, tempoFactor]);

  const start = async (file?: File) => {
    if (!file) return;
    setError('');
    setResult(null);
    setProgress(0);
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    try {
      setResult(await readVideo(file, setProgress));
    } catch (problem) {
      setError(problem instanceof VideoError ? problem.message : 'Beim Lesen des Videos ist etwas schiefgegangen.');
    }
    setProgress(null);
  };

  if (progress !== null) {
    return (
      <Screen>
        <p className={KICKER}>Video wird gelesen</p>
        <p className="mt-4 font-serif text-7xl text-text tabular-nums" aria-live="polite">{Math.round(progress * 100)}<span className="text-accent"> %</span></p>
        <div className="mt-8 h-px bg-line"><div className="h-px bg-accent" style={{ width: `${progress * 100}%` }} /></div>
        <p className="mt-4 text-sm text-dim">Lass diese Seite offen. Das Video läuft unsichtbar durch.</p>
      </Screen>
    );
  }

  if (result && reading) {
    const bars = Math.ceil(Math.max(handTicks(reading.piece.hands.right), handTicks(reading.piece.hands.left)) / barTicks(reading.piece));
    return (
      <Screen>
        <p className={KICKER}>Erkannt</p>
        <div className="mt-3 text-4xl">
          <input
            aria-label="Titel" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-transparent border-b border-line pb-2 font-serif text-text outline-none focus:border-accent"
          />
        </div>
        <dl className="mt-8 grid grid-cols-3 gap-4">
          {[['Noten', result.notes.length], ['Takte', bars], ['Tempo', Math.round(reading.bpm)]].map(([name, value]) => (
            <div key={name}>
              <dt className={KICKER}>{name}</dt>
              <dd className="mt-1 font-serif text-3xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {!reading.sure && (
          <p className="mt-6 border-l border-accent pl-3 text-sm text-dim">
            Dieses Stück hat keinen gleichmäßigen Takt. Die Töne stimmen, die Notenlängen musst du wahrscheinlich nachkorrigieren.
          </p>
        )}

        <div className="mt-8 space-y-5">
          <div>
            <p className={KICKER}>Tempo falsch erkannt?</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[[0.5, 'Halb'], [1, 'So lassen'], [2, 'Doppelt']].map(([factor, name]) => (
                <Chip key={factor} on={tempoFactor === factor} onClick={() => setTempoFactor(factor as number)}>{name}</Chip>
              ))}
            </div>
          </div>
          {!result.fullKeyboard && (
            <div>
              <p className={KICKER}>Oktave</p>
              <p className="mt-1 text-sm text-dim">Das Video zeigt nicht alle 88 Tasten, die Oktave ist deshalb geschätzt.</p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {OCTAVES.map(o => <Chip key={o} on={octave === o} onClick={() => setOctave(o)}>{o > 0 ? `+${o}` : o}</Chip>)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-2">
          <button type="button" onClick={() => onCreate(title, reading.piece)} className={BUTTON}>Notenblatt erstellen</button>
          <button type="button" onClick={() => setResult(null)} className={TEXT_BUTTON}>Anderes Video</button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <p className={KICKER}>Video zu Noten</p>
      <h1 className="mt-3 font-serif text-5xl leading-[1.05]">Ein Tutorial mit fallenden Noten auswählen.</h1>
      <p className="mt-5 text-dim">
        Die Seite liest die Balken direkt aus dem Bild und schreibt daraus das Notenblatt. Das Video bleibt auf deinem Gerät.
      </p>
      {error && <p role="alert" className="mt-6 border-l border-danger pl-3 text-sm text-text">{error}</p>}
      <div className="mt-10 grid gap-2">
        <button type="button" onClick={() => input.current?.click()} className={BUTTON}>Video auswählen</button>
        <button type="button" onClick={onCancel} className={BUTTON_GHOST}>Zurück</button>
      </div>
      <input ref={input} type="file" accept="video/*" aria-label="Videodatei" className="hidden" onChange={e => { void start(e.target.files?.[0]); e.target.value = ''; }} />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="appear mx-auto w-full max-w-xl px-6 py-12 sm:py-20">{children}</div>
    </div>
  );
}
