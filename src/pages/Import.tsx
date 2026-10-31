import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Keyboard } from '../components/Keyboard';
import { BUTTON_RED, BUTTON_SOFT, Choice, LABEL, TEXT_BUTTON } from '../components/ui';
import type { Piece } from '../types';
import { cn } from '../utils/cn';
import { barTicks, handTicks } from '../utils/score';
import { VideoError, readVideo } from '../video/readVideo';
import { writeDown } from '../video/rhythm';
import type { Detected } from '../video/tracker';

type Fields = Pick<Piece, 'beats' | 'beatValue' | 'key' | 'bpm' | 'hands'>;
const TEMPOS = [{ id: 0.5, label: 'Halb' }, { id: 1, label: 'Normal' }, { id: 2, label: 'Doppelt' }];
const OCTAVES = [-2, -1, 0, 1, 2].map(id => ({ id, label: id > 0 ? `+${id}` : String(id) }));

// A recording's own file name says nothing about the piece
const titleFrom = (file: File) => {
  const name = file.name.replace(/\.[^.]+$/, '');
  return /^(ScreenRecording|RPReplay|IMG_|Bildschirmaufnahme|Screen Recording)/i.test(name) ? 'Neues Stück' : name;
};

export function Import({ first, onCreate, onCancel }: { first?: File | null; onCreate: (title: string, fields: Fields) => void; onCancel: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ notes: Detected[]; fullKeyboard: boolean } | null>(null);
  const [title, setTitle] = useState('');
  const [octave, setOctave] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1);
  const input = useRef<HTMLInputElement>(null);

  const reading = useMemo(() => (result ? writeDown(result.notes, { octave, tempoFactor }) : null), [result, octave, tempoFactor]);

  const start = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setResult(null);
    setProgress(0);
    setTitle(titleFrom(file));
    try {
      // Whole percents only: redrawing the keys for every picture would slow the reading down
      setResult(await readVideo(file, share => setProgress(Math.floor(share * 100) / 100)));
    } catch (problem) {
      setError(problem instanceof VideoError ? problem.message : 'Beim Lesen des Videos ist etwas schiefgegangen.');
    }
    setProgress(null);
  };

  useEffect(() => {
    void start(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a video dropped on the way here
  }, [first]);

  if (progress !== null) {
    // The keys light up from left to right as the video is read
    const high = 21 + Math.round(progress * 87);
    const lit = new Set(Array.from({ length: high - 20 }, (_, i) => 21 + i));
    return (
      <Screen>
        <h1 className="text-[28px] font-bold tracking-tight">Noten werden gelesen</h1>
        <p className="mt-2 text-dim">Das dauert so lange wie das Video. Lass die Seite dabei offen.</p>
        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-card">
          <Keyboard fit active={lit} className="h-24" />
        </div>
        <p className="mt-4 text-center text-[28px] font-semibold tabular-nums" aria-live="polite">{Math.round(progress * 100)} %</p>
      </Screen>
    );
  }

  if (result && reading) {
    const bars = Math.ceil(Math.max(handTicks(reading.piece.hands.right), handTicks(reading.piece.hands.left)) / barTicks(reading.piece));
    return (
      <Screen>
        <span className="pop flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white"><Check className="h-7 w-7" strokeWidth={2.5} /></span>
        <h1 className="mt-4 text-[28px] font-bold tracking-tight">Fertig gelesen</h1>

        <label className={cn(LABEL, 'mt-6 block')}>Titel
          <span className="mt-1 block text-[17px]">
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl bg-card px-3 py-3 font-semibold text-text outline-none" />
          </span>
        </label>

        <dl className="mt-3 grid grid-cols-3 gap-3">
          {[['Noten', result.notes.length], ['Takte', bars], ['Tempo', Math.round(reading.bpm)]].map(([name, value]) => (
            <div key={name} className="rounded-2xl bg-card p-3">
              <dd className="text-[24px] font-semibold tabular-nums">{value}</dd>
              <dt className={LABEL}>{name}</dt>
            </div>
          ))}
        </dl>

        {!reading.sure && (
          <p className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm text-text">
            Das Stück ist frei gespielt, die Notenlängen sind deshalb geschätzt. Hör es dir unter „Üben“ an und korrigiere, was nicht passt.
          </p>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <p className={LABEL}>Tempo</p>
            <Choice items={TEMPOS} value={tempoFactor} onChange={setTempoFactor} className="mt-1" />
          </div>
          {!result.fullKeyboard && (
            <div>
              <p className={LABEL}>Oktave – das Video zeigt nicht alle Tasten</p>
              <Choice items={OCTAVES} value={octave} onChange={setOctave} className="mt-1" />
            </div>
          )}
        </div>

        <div className="mt-7 grid gap-1">
          <button type="button" onClick={() => onCreate(title, reading.piece)} className={BUTTON_RED}>Notenblatt erstellen</button>
          <button type="button" onClick={() => setResult(null)} className={TEXT_BUTTON}>Anderes Video</button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <h1 className="text-[28px] font-bold tracking-tight">Video auswählen</h1>
      <p className="mt-2 text-dim">
        Nimm das Tutorial per Bildschirmaufnahme auf und wähle die Datei hier aus. Alle Tasten sollten zu sehen sein. Das Video bleibt auf deinem Gerät.
      </p>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-accent-soft p-3 text-sm text-text">{error}</p>}
      <div className="mt-7 grid gap-2">
        <button type="button" onClick={() => input.current?.click()} className={BUTTON_RED}>Video auswählen</button>
        <button type="button" onClick={onCancel} className={BUTTON_SOFT}>Zurück</button>
      </div>
      <input ref={input} type="file" accept="video/*" aria-label="Videodatei" className="hidden" onChange={e => { void start(e.target.files?.[0]); e.target.value = ''; }} />
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="appear mx-auto w-full max-w-lg px-4 py-8 md:py-16">{children}</div>
    </div>
  );
}
