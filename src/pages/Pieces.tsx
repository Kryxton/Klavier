import { useRef, useState, type DragEvent } from 'react';
import { ChevronRight, FilePlus2, Trash2, Video } from 'lucide-react';
import { LookRule } from '../components/LookRule';
import { ICON_BUTTON, LABEL } from '../components/ui';
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
      <div className="appear mx-auto w-full max-w-2xl px-4 pt-6 pb-10 md:px-8 md:pt-12">
        <h1 className="font-display text-[36px] leading-tight font-semibold md:text-[44px]"><span className="sheen-text">Stücke</span></h1>
        <LookRule className="-mt-2 -mb-5" />

        <button
          type="button"
          onClick={onVideo}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            'mt-5 flex w-full items-center gap-4 rounded-2xl border border-line bg-card px-4 py-4 text-left',
            dragging && 'border-accent',
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center sheen rounded-full bg-accent text-on-accent"><Video className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Video in Noten umwandeln</span>
            <span className="block text-[13px] text-dim">Aufnahme eines Tutorials wählen oder hierher ziehen</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-dim" />
        </button>

        <div className="mt-9 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-dim">Deine Stücke</h2>
          <button type="button" onClick={onCreate} className="flex items-center gap-1.5 text-[14px] font-medium text-text">
            <FilePlus2 className="h-4 w-4" /> Leeres Notenblatt
          </button>
        </div>

        {sorted.length > 0 && (
          <ul className="mt-2 border-t border-line" aria-label="Deine Stücke">
            {sorted.map(piece => (
              <li key={piece.id} className="flex items-center border-b border-line">
                <button type="button" onClick={() => onOpen(piece.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 text-left active:scale-100">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-[19px] leading-snug font-semibold">{piece.title || 'Ohne Titel'}</span>
                      {piece.id === openId && <span aria-label="geöffnet" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    </span>
                    <span className={cn(LABEL, 'block tabular-nums')}>{barCount(piece)} Takte · {keyLabel(piece.key)} · {piece.beats}/{piece.beatValue}</span>
                  </span>
                </button>
                {confirming === piece.id ? (
                  <button type="button" onClick={() => { onDelete(piece.id); setConfirming(null); }} className="shrink-0 px-2 py-3 text-sm font-medium text-danger">
                    Wirklich löschen
                  </button>
                ) : (
                  <button type="button" aria-label={`${piece.title} löschen`} onClick={() => setConfirming(piece.id)} className={cn(ICON_BUTTON, '-mr-2 text-dim')}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap gap-x-5 text-[14px] text-dim">
          <button type="button" onClick={backup} disabled={!pieces.length} className="min-h-11 disabled:opacity-30">Backup sichern</button>
          <button type="button" onClick={() => file.current?.click()} className="min-h-11">Backup laden</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {message && <p className={cn(LABEL, 'mt-1')}>{message}</p>}
      </div>
    </div>
  );
}
