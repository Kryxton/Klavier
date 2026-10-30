import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BUTTON, ICON_BUTTON, KICKER, TEXT_BUTTON } from '../components/ui';
import type { Piece } from '../types';
import { barCount } from '../utils/score';
import { exportPieces, importPieces } from '../utils/storage';

export function Pieces({ pieces, openId, onOpen, onVideo, onCreate, onDelete, onImport }: {
  pieces: Piece[]; openId: string | null; onOpen: (id: string) => void; onVideo: () => void; onCreate: () => void;
  onDelete: (id: string) => void; onImport: (pieces: Piece[]) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const backup = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([exportPieces(pieces)], { type: 'application/json' }));
    link.download = 'klavier-stuecke.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const restore = async (chosen?: File) => {
    if (!chosen) return;
    try {
      const incoming = importPieces(await chosen.text());
      onImport(incoming);
      setMessage(`${incoming.length} ${incoming.length === 1 ? 'Stück' : 'Stücke'} geladen.`);
    } catch {
      setMessage('Diese Datei enthält keine Stücke.');
    }
  };

  const sorted = [...pieces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="h-full overflow-y-auto">
      <div className="appear mx-auto w-full max-w-3xl px-6 py-12 sm:py-20">
        <p className={KICKER}>Klavier</p>
        <h1 className="mt-3 max-w-xl font-serif text-5xl sm:text-7xl leading-[1.02]">
          Aus dem Video wird <em className="text-accent">ein Notenblatt.</em>
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="button" onClick={onVideo} className={BUTTON}>Video auswählen</button>
          <button type="button" onClick={onCreate} className={TEXT_BUTTON}>Leeres Notenblatt</button>
        </div>

        {sorted.length > 0 && (
          <section className="mt-16" aria-label="Deine Stücke">
            <p className={KICKER}>Deine Stücke</p>
            <ol className="mt-3 border-t border-line">
              {sorted.map((piece, index) => (
                <li key={piece.id} className="flex items-center gap-4 border-b border-line">
                  <button type="button" onClick={() => onOpen(piece.id)} className="flex flex-1 min-w-0 items-baseline gap-4 py-4 text-left">
                    <span className="font-serif text-accent tabular-nums">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 break-words font-serif text-2xl leading-tight">{piece.title || 'Ohne Titel'}</span>
                    <span className="shrink-0 text-xs text-dim tabular-nums">{barCount(piece)} Takte{piece.id === openId ? ' · offen' : ''}</span>
                  </button>
                  {confirming === piece.id ? (
                    <button type="button" onClick={() => { onDelete(piece.id); setConfirming(null); }} className="shrink-0 py-3 text-xs text-danger">
                      Wirklich löschen
                    </button>
                  ) : (
                    <button type="button" aria-label={`${piece.title} löschen`} onClick={() => setConfirming(piece.id)} className={ICON_BUTTON}>
                      <X className="w-4 h-4" strokeWidth={1.25} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-x-4">
          <button type="button" onClick={backup} disabled={!pieces.length} className={TEXT_BUTTON}>Backup sichern</button>
          <button type="button" onClick={() => file.current?.click()} className={TEXT_BUTTON}>Backup laden</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {message && <p className="mt-2 text-sm text-dim">{message}</p>}
      </div>
    </div>
  );
}
