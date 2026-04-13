import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  headingsPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useEffect } from 'react'

import { DraggableTopBar } from './components/DraggableTopBar'
import { useAutosave } from './hooks/useAutosave'
import {
  selectCurrentNote,
  selectIsBusy,
  selectNoteList,
  useNoteStore
} from './store/noteStore'

const editorPlugins = [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  markdownShortcutPlugin(),
  toolbarPlugin({
    toolbarContents: () => (
      <>
        <UndoRedo />
        <BlockTypeSelect />
        <BoldItalicUnderlineToggles />
      </>
    )
  })
]

const formatLastEditTime = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return 'Unknown update time'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}

const SidebarButton = ({
  children,
  disabled,
  onClick,
  tone = 'default'
}: {
  children: string
  disabled?: boolean
  onClick: () => void
  tone?: 'default' | 'danger'
}): JSX.Element => {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-500/40 text-red-200 hover:border-red-400/60 hover:bg-red-500/10'
      : 'border-white/15 text-zinc-100 hover:border-white/30 hover:bg-white/10'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses}`}
    >
      {children}
    </button>
  )
}

function App(): JSX.Element {
  const hydrateNotes = useNoteStore((state) => state.hydrateNotes)
  const notes = useNoteStore(selectNoteList)
  const currentNote = useNoteStore(selectCurrentNote)
  const currentNoteId = useNoteStore((state) => state.currentNoteId)
  const draftContent = useNoteStore((state) => state.draftContent)
  const hasUnsavedChanges = useNoteStore((state) => state.hasUnsavedChanges)
  const isHydrating = useNoteStore((state) => state.isHydrating)
  const isReading = useNoteStore((state) => state.isReading)
  const isSaving = useNoteStore((state) => state.isSaving)
  const isCreating = useNoteStore((state) => state.isCreating)
  const isDeleting = useNoteStore((state) => state.isDeleting)
  const error = useNoteStore((state) => state.error)
  const isBusy = useNoteStore(selectIsBusy)
  const selectNote = useNoteStore((state) => state.selectNote)
  const setDraftContent = useNoteStore((state) => state.setDraftContent)
  const createNote = useNoteStore((state) => state.createNote)
  const deleteCurrentNote = useNoteStore((state) => state.deleteCurrentNote)
  const clearError = useNoteStore((state) => state.clearError)

  useAutosave()

  useEffect(() => {
    void hydrateNotes()
  }, [hydrateNotes])

  const statusLabel = (() => {
    if (isHydrating) return 'Loading notes...'
    if (isCreating) return 'Creating note...'
    if (isDeleting) return 'Deleting note...'
    if (isReading) return 'Opening note...'
    if (isSaving) return 'Saving...'
    if (hasUnsavedChanges) return 'Unsaved changes'
    return 'All changes saved'
  })()

  return (
    <>
      <DraggableTopBar />

      <main className="flex h-screen bg-zinc-950 text-zinc-100">
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/10 bg-zinc-900/80 pt-8">
          <div className="space-y-4 border-b border-white/10 px-4 py-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">NoteMark</p>
              <h1 className="text-xl font-semibold text-white">Markdown notes</h1>
              <p className="text-sm text-zinc-400">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </p>
            </div>

            <div className="flex gap-2">
              <SidebarButton disabled={isBusy} onClick={() => void createNote()}>
                New note
              </SidebarButton>
              <SidebarButton
                tone="danger"
                disabled={!currentNoteId || isBusy}
                onClick={() => void deleteCurrentNote()}
              >
                Delete
              </SidebarButton>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                <div className="flex items-start justify-between gap-3">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={clearError}
                    className="text-xs uppercase tracking-[0.2em] text-red-200/80 transition hover:text-red-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {notes.length ? (
              <ul className="space-y-2">
                {notes.map((note) => {
                  const isActive = note.title === currentNoteId

                  return (
                    <li key={note.title}>
                      <button
                        type="button"
                        onClick={() => void selectNote(note.title)}
                        className={`flex w-full flex-col rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? 'border-white/30 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.15)]'
                            : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate text-sm font-medium text-white">{note.title}</span>
                        <span className="mt-1 text-xs text-zinc-400">
                          {formatLastEditTime(note.lastEditTime)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                Create your first note to start writing.
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-zinc-950/90 pt-8">
          <header className="border-b border-white/10 px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Current note</p>
                <h2 className="truncate text-2xl font-semibold text-white">
                  {currentNote?.title ?? 'No note selected'}
                </h2>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-300">
                {statusLabel}
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {currentNote ? (
              <div className="h-full">
                <MDXEditor
                  key={currentNote.title}
                  markdown={draftContent}
                  onChange={setDraftContent}
                  plugins={editorPlugins}
                  className="h-full bg-transparent"
                  contentEditableClassName="prose prose-invert prose-zinc mx-auto min-h-[calc(100vh-13rem)] max-w-4xl px-6 py-8 focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="space-y-2">
                  <p className="text-lg font-medium text-zinc-200">Nothing selected</p>
                  <p className="text-sm text-zinc-500">
                    Pick a note from the sidebar or create a new one.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

export default App
