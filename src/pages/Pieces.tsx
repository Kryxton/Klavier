import { useRef, useState, type DragEvent } from 'react';
import { ChevronRight, FilePlus2, Music, Trash2, Video } from 'lucide-react';
import { ICON_BUTTON, LABEL, TEXT_BUTTON } from '../components/ui';
import type { Piece } from '../types';
import { cn } from '../utils/cn';
import { KEY_CHOICES } from '../utils/notes';
import { barCount } from '../utils/score';
import { exportPieces, importPieces } from '../utils/storage';

export function Pieces({ pieces, openId, onOpen, onVideo, onDropVideo, onCreate, onDelete, onImport }: {
  pieces: Piece[]; openId: string | null; onOpen: (id: string) => void; onVideo: () => void; onDropVideo: (file: File) => void;
  onCreate: () => void; onDelete: (id: string) => void; onImport: (pieces: Piece[]) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
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

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onDropVideo(dropped);
  };

  const sorted = [...pieces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const keyLabel = (key: number) => KEY_CHOICES.find(k => k.id === key)?.label.split(' / ')[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="appear mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="text-[32px] font-bold tracking-tight">Stücke</h1>

        <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <button
            type="button"
            onClick={onVideo}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={cn(
              'flex items-center gap-4 rounded-2xl bg-accent p-5 text-left text-white',
              dragging && 'ring-4 ring-accent/30',
            )}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15"><Video className="h-6 w-6" /></span>
            <span className="min-w-0">
              <span className="block text-[17px] font-semibold">Video in Noten umwandeln</span>
              <span className="block text-sm text-white/80">Aufnahme eines Tutorials auswählen</span>
            </span>
          </button>
          <button type="button" onClick={onCreate} className="flex items-center gap-4 rounded-2xl bg-card p-5 text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-track"><FilePlus2 className="h-5 w-5" /></span>
            <span className="text-[17px] font-semibold">Leeres Notenblatt</span>
          </button>
        </div>

        {sorted.length > 0 && (
          <ul className="mt-6 grid gap-3 md:grid-cols-2" aria-label="Deine Stücke">
            {sorted.map(piece => (
              <li key={piece.id} className={cn('flex items-center rounded-2xl bg-card', piece.id === openId && 'ring-1 ring-accent/40')}>
                <button type="button" onClick={() => onOpen(piece.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Music className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{piece.title || 'Ohne Titel'}</span>
                    <span className={cn(LABEL, 'block')}>{barCount(piece)} Takte · {keyLabel(piece.key)}</span>
                  </span>
                  {confirming !== piece.id && <ChevronRight className="h-4 w-4 shrink-0 text-dim" />}
                </button>
                {confirming === piece.id ? (
                  <button type="button" onClick={() => { onDelete(piece.id); setConfirming(null); }} className="shrink-0 px-3 py-3 text-sm font-medium text-danger">
                    Wirklich löschen
                  </button>
                ) : (
                  <button type="button" aria-label={`${piece.title} löschen`} onClick={() => setConfirming(piece.id)} className={cn(ICON_BUTTON, 'mr-1 text-dim')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-x-3">
          <button type="button" onClick={backup} disabled={!pieces.length} className={TEXT_BUTTON}>Backup sichern</button>
          <button type="button" onClick={() => file.current?.click()} className={TEXT_BUTTON}>Backup laden</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {message && <p className={cn(LABEL, 'mt-1 px-2')}>{message}</p>}
      </div>
    </div>
  );
}
