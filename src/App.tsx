import { useCallback, useEffect, useRef, useState } from 'react';
import { FileMusic, ListMusic, Pencil, Play } from 'lucide-react';
import { Empty } from './components/ui';
import { Pieces } from './pages/Pieces';
import { Practice } from './pages/Practice';
import { Write } from './pages/Write';
import type { Piece } from './types';
import { cn } from './utils/cn';
import { newPiece } from './utils/edit';
import { loadLibrary, mergePieces, saveLibrary, type Library } from './utils/storage';

type Page = 'pieces' | 'write' | 'practice';
const NAV: { id: Page; label: string; icon: typeof ListMusic }[] = [
  { id: 'pieces', label: 'Stücke', icon: ListMusic },
  { id: 'write', label: 'Schreiben', icon: Pencil },
  { id: 'practice', label: 'Üben', icon: Play },
];
const UNDO_STEPS = 100;

export default function App() {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [page, setPage] = useState<Page>(() => (loadLibrary().openId ? 'write' : 'pieces'));
  const [saved, setSaved] = useState(true);
  const [steps, setSteps] = useState<{ past: Piece[]; future: Piece[] }>({ past: [], future: [] });
  const libraryNow = useRef(library);

  useEffect(() => {
    libraryNow.current = library;
    setSaved(saveLibrary(library));
  }, [library]);

  const piece = library.pieces.find(p => p.id === library.openId) ?? null;

  const replace = (next: Piece) =>
    setLibrary(old => ({ ...old, pieces: old.pieces.map(p => (p.id === next.id ? next : p)) }));

  const change = useCallback((update: (piece: Piece) => Piece) => {
    const { pieces, openId } = libraryNow.current;
    const current = pieces.find(p => p.id === openId);
    if (!current) return;
    const next = { ...update(current), updatedAt: new Date().toISOString() };
    libraryNow.current = { pieces: pieces.map(p => (p.id === next.id ? next : p)), openId };
    setLibrary(libraryNow.current);
    setSteps(old => ({ past: [...old.past.slice(1 - UNDO_STEPS), current], future: [] }));
  }, []);

  const undo = () => {
    const last = steps.past[steps.past.length - 1];
    if (!last || !piece) return;
    replace(last);
    setSteps({ past: steps.past.slice(0, -1), future: [piece, ...steps.future] });
  };

  const redo = () => {
    const [next, ...rest] = steps.future;
    if (!next || !piece) return;
    replace(next);
    setSteps({ past: [...steps.past, piece], future: rest });
  };

  const open = (id: string) => {
    setLibrary(old => ({ ...old, openId: id }));
    setSteps({ past: [], future: [] });
    setPage('write');
  };

  const create = () => {
    const fresh = newPiece();
    setLibrary(old => ({ pieces: [...old.pieces, fresh], openId: fresh.id }));
    setSteps({ past: [], future: [] });
    setPage('write');
  };

  const remove = (id: string) => {
    setLibrary(old => ({ pieces: old.pieces.filter(p => p.id !== id), openId: old.openId === id ? null : old.openId }));
    if (id === library.openId) setSteps({ past: [], future: [] });
  };

  const needsPiece = (
    <div className="p-4 mx-auto max-w-2xl">
      <Empty>
        <FileMusic className="w-6 h-6 mx-auto mb-2" />
        Wähle zuerst unter „Stücke“ ein Stück aus.
      </Empty>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col bg-ink text-text">
      {!saved && (
        <p role="alert" className="shrink-0 px-3 py-2 text-sm bg-danger text-text">
          Speichern im Browser hat nicht geklappt. Lade unter „Stücke“ ein Backup herunter.
        </p>
      )}
      <main className="flex-1 min-h-0">
        {page === 'pieces' && (
          <Pieces
            pieces={library.pieces} openId={library.openId} onOpen={open} onCreate={create} onDelete={remove}
            onImport={incoming => setLibrary(old => ({ ...old, pieces: mergePieces(old.pieces, incoming) }))}
          />
        )}
        {page === 'write' && (piece
          ? <Write key={piece.id} piece={piece} change={change} undo={undo} redo={redo} canUndo={steps.past.length > 0} canRedo={steps.future.length > 0} />
          : needsPiece)}
        {page === 'practice' && (piece ? <Practice key={piece.id} piece={piece} /> : needsPiece)}
      </main>
      <nav className="shrink-0 grid grid-cols-3 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id} type="button" onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-1.5 text-[11px]', page === id ? 'text-accent' : 'text-dim')}
          >
            <Icon className="w-5 h-5" /> {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
