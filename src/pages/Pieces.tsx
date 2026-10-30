import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { BUTTON, BUTTON_GHOST, Empty, HEADING } from '../components/ui';
import type { Piece } from '../types';
import { barCount } from '../utils/score';
import { exportPieces, importPieces } from '../utils/storage';
import { cn } from '../utils/cn';

export function Pieces({ pieces, openId, onOpen, onCreate, onDelete, onImport }: {
  pieces: Piece[]; openId: string | null; onOpen: (id: string) => void; onCreate: () => void;
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
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className={cn(HEADING, 'text-2xl')}>Stücke</h1>
          <button type="button" onClick={onCreate} className={BUTTON}><Plus className="w-4 h-4" /> Neues Stück</button>
        </div>

        {sorted.length === 0 && <Empty>Noch keine Stücke. Leg eins an und tippe das erste Video ab.</Empty>}

        <ul className="space-y-2">
          {sorted.map(piece => (
            <li key={piece.id} className={cn('flex items-stretch rounded-md border bg-card', piece.id === openId ? 'border-accent' : 'border-line')}>
              <button type="button" onClick={() => onOpen(piece.id)} className="flex-1 min-w-0 px-3 py-3 text-left">
                <div className="break-words">{piece.title || 'Ohne Titel'}</div>
                <div className="text-xs text-dim">{barCount(piece)} Takte · {new Date(piece.updatedAt).toLocaleDateString('de-DE')}</div>
              </button>
              {confirming === piece.id ? (
                <button type="button" onClick={() => { onDelete(piece.id); setConfirming(null); }} className="px-3 text-sm text-danger">
                  Wirklich löschen
                </button>
              ) : (
                <button type="button" aria-label={`${piece.title} löschen`} onClick={() => setConfirming(piece.id)} className="w-12 flex items-center justify-center text-dim">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button type="button" onClick={backup} disabled={!pieces.length} className={BUTTON_GHOST}><Download className="w-4 h-4" /> Backup</button>
          <button type="button" onClick={() => file.current?.click()} className={BUTTON_GHOST}><Upload className="w-4 h-4" /> Backup laden</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {message && <p className="text-sm text-dim">{message}</p>}
      </div>
    </div>
  );
}
