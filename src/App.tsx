import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { FileMusic, ListMusic, Play } from 'lucide-react';
import { LookRule } from './components/LookRule';
import { Empty } from './components/ui';
import { Import } from './pages/Import';
import { Pieces } from './pages/Pieces';
import { Practice } from './pages/Practice';
import { Write } from './pages/Write';
import type { Piece } from './types';
import { cn } from './utils/cn';
import { newPiece } from './utils/edit';
import { deleteRecording, saveRecording } from './utils/recordings';
import { smoothly } from './utils/smooth';
import { loadLibrary, mergePieces, saveLibrary, type Library } from './utils/storage';
import { useUpdateAvailable } from './utils/update';
import { RATE } from './video/sound';

type Page = 'pieces' | 'import' | 'write' | 'practice';
const NAV: { id: Page; label: string; icon: typeof ListMusic }[] = [
  { id: 'pieces', label: 'Stücke', icon: ListMusic },
  { id: 'write', label: 'Notenblatt', icon: FileMusic },
  { id: 'practice', label: 'Üben', icon: Play },
];
const UNDO_STEPS = 100;

export default function App() {
  const [library, setLibrary] = useState<Library>(loadLibrary);
  const [page, showPage] = useState<Page>(() => (loadLibrary().openId ? 'write' : 'pieces'));
  const [dropped, setDropped] = useState<File | null>(null);
  const setPage = (next: Page) => smoothly(() => showPage(next));
  const [saved, setSaved] = useState(true);
  const [steps, setSteps] = useState<{ past: Piece[]; future: Piece[] }>({ past: [], future: [] });
  const libraryNow = useRef(library);
  const update = useUpdateAvailable();

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

  const createFrom = (title: string, fields: Pick<Piece, 'beats' | 'beatValue' | 'key' | 'bpm' | 'hands' | 'source'>, samples: Float32Array | null) => {
    const fresh = { ...newPiece(title), ...fields };
    if (samples) void saveRecording(fresh.id, samples, RATE);
    setLibrary(old => ({ pieces: [...old.pieces, fresh], openId: fresh.id }));
    setSteps({ past: [], future: [] });
    setPage('write');
  };

  const remove = (id: string) => {
    void deleteRecording(id);
    setLibrary(old => ({ pieces: old.pieces.filter(p => p.id !== id), openId: old.openId === id ? null : old.openId }));
    if (id === library.openId) setSteps({ past: [], future: [] });
  };

  const needsPiece = (
    <div className="mx-auto max-w-2xl">
      <Empty>Wähle zuerst unter „Stücke“ ein Stück aus.</Empty>
    </div>
  );

  const activeTab = Math.max(0, NAV.findIndex(item => item.id === page));

  return (
    <div className="h-dvh flex flex-col-reverse pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] lg:flex-row bg-ink text-text">
      <nav className="shrink-0 border-t border-line bg-nav pb-[env(safe-area-inset-bottom)] lg:w-56 lg:border-t-0 lg:border-r lg:p-3 lg:pb-3">
        <p className="hidden px-3 pt-2 pb-3 lg:block"><span className="sheen-text font-display text-[24px] font-semibold">Klavier</span></p>
        <div className="hidden px-3 pb-1 lg:block"><LookRule className="-mt-5 -mb-2" /></div>
        <div className="relative grid grid-cols-3 lg:grid-cols-1">
          <div
            aria-hidden
            style={{ '--tab': activeTab, transition: 'transform 300ms var(--ease-out-soft)' } as CSSProperties}
            className="absolute left-0 top-0 flex h-0.5 w-1/3 justify-center [transform:translateX(calc(var(--tab)*100%))] lg:h-11 lg:w-full lg:rounded-control lg:bg-track lg:shadow-thumb lg:[transform:translateY(calc(var(--tab)*100%))]"
          ><span className="sheen h-full w-8 rounded-full bg-accent lg:hidden" /></div>
          {NAV.map(({ id, label, icon: Icon }, index) => {
            const on = index === activeTab;
            return (
              <button
                key={id} type="button" onClick={() => setPage(id)} aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative flex h-[54px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-[15px]',
                  on ? 'text-text' : 'text-dim',
                )}
              >
                <Icon className="h-[22px] w-[22px] lg:h-5 lg:w-5" strokeWidth={on ? 2.25 : 1.75} /> {label}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pb-[env(safe-area-inset-bottom)]">
        {update && (
          <button type="button" onClick={() => location.reload()} className="shrink-0 bg-text px-3 py-2 text-left text-sm text-on-text">
            Neue Version da. Zum Laden tippen.
          </button>
        )}
        {!saved && (
          <p role="alert" className="shrink-0 bg-accent px-3 py-2 text-sm text-on-accent">
            Speichern im Browser hat nicht geklappt. Lade unter „Stücke“ ein Backup herunter.
          </p>
        )}
        <main className="min-h-0 flex-1">
          {page === 'pieces' && (
            <Pieces
              pieces={library.pieces} openId={library.openId} onOpen={open} onCreate={create} onDelete={remove}
              onVideo={() => { setDropped(null); setPage('import'); }}
              onDropVideo={file => { setDropped(file); setPage('import'); }}
              onImport={incoming => setLibrary(old => ({ ...old, pieces: mergePieces(old.pieces, incoming) }))}
            />
          )}
          {page === 'import' && <Import first={dropped} onCreate={createFrom} onCancel={() => setPage('pieces')} />}
          {page === 'write' && (piece
            ? <Write key={piece.id} piece={piece} change={change} undo={undo} redo={redo} canUndo={steps.past.length > 0} canRedo={steps.future.length > 0} />
            : needsPiece)}
          {page === 'practice' && (piece ? <Practice key={piece.id} piece={piece} /> : needsPiece)}
        </main>
      </div>
    </div>
  );
}
