import { create } from 'zustand'

export type NoteInfo = {
  title: string
  lastEditTime: number
}

export type NoteStoreState = {
  notes: NoteInfo[]
  currentNoteId: string | null
  currentNoteContent: string
  draftContent: string
  hasUnsavedChanges: boolean
  isHydrating: boolean
  isReading: boolean
  isSaving: boolean
  isCreating: boolean
  isDeleting: boolean
  error: string | null
}

export type NoteStoreActions = {
  hydrateNotes: () => Promise<void>
  selectNote: (noteId: string) => Promise<void>
  setDraftContent: (content: string) => void
  saveCurrentNote: () => Promise<boolean>
  createNote: () => Promise<void>
  deleteCurrentNote: () => Promise<void>
  reloadNotes: () => Promise<void>
  clearError: () => void
}

export type NoteStore = NoteStoreState & NoteStoreActions

type NoteContextBridge = {
  getNotes: () => Promise<unknown[]>
  readNote: (title: string) => Promise<string | undefined>
  writeNote: (title: string, content: string) => Promise<void>
  createNote: () => Promise<unknown>
  deleteNote: (title: string) => Promise<void>
}

const emptyEditorState = {
  currentNoteId: null,
  currentNoteContent: '',
  draftContent: '',
  hasUnsavedChanges: false
} satisfies Pick<
  NoteStoreState,
  'currentNoteId' | 'currentNoteContent' | 'draftContent' | 'hasUnsavedChanges'
>

const getNoteContext = (): NoteContextBridge => {
  return (window as Window & { context: NoteContextBridge }).context
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Unexpected note operation failure'
}

const normalizeTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedNumber = Number(value)

    if (Number.isFinite(parsedNumber)) {
      return parsedNumber
    }

    const parsedDate = Date.parse(value)

    if (Number.isFinite(parsedDate)) {
      return parsedDate
    }
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  return Date.now()
}

const normalizeTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const title = value.trim()

  return title ? title : null
}

const normalizeNoteInfo = (value: unknown): NoteInfo | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const title = normalizeTitle(candidate.title ?? candidate.name ?? candidate.fileName)

  if (!title) {
    return null
  }

  return {
    title,
    lastEditTime: normalizeTimestamp(
      candidate.lastEditTime ??
        candidate.updatedAt ??
        candidate.modifiedAt ??
        candidate.mtimeMs ??
        candidate.mtime
    )
  }
}

const sortNotes = (notes: NoteInfo[]): NoteInfo[] => {
  return [...notes].sort((left, right) => right.lastEditTime - left.lastEditTime)
}

const normalizeNotes = (notes: unknown[]): NoteInfo[] => {
  return sortNotes(notes.map(normalizeNoteInfo).filter((note): note is NoteInfo => note !== null))
}

let activeReadRequest = 0

export const useNoteStore = create<NoteStore>((set, get) => {
  const readNoteIntoEditor = async (noteId: string): Promise<void> => {
    const requestId = ++activeReadRequest

    set({ isReading: true, error: null })

    try {
      const content = (await getNoteContext().readNote(noteId)) ?? ''

      if (requestId !== activeReadRequest) {
        return
      }

      set({
        currentNoteId: noteId,
        currentNoteContent: content,
        draftContent: content,
        hasUnsavedChanges: false,
        isReading: false,
        isHydrating: false,
        error: null
      })
    } catch (error) {
      if (requestId !== activeReadRequest) {
        return
      }

      set({
        isReading: false,
        isHydrating: false,
        error: getErrorMessage(error)
      })
    }
  }

  const fetchNotes = async (): Promise<NoteInfo[]> => {
    const notes = await getNoteContext().getNotes()

    return normalizeNotes(Array.isArray(notes) ? notes : [])
  }

  return {
    notes: [],
    ...emptyEditorState,
    isHydrating: false,
    isReading: false,
    isSaving: false,
    isCreating: false,
    isDeleting: false,
    error: null,

    hydrateNotes: async () => {
      if (get().isHydrating) {
        return
      }

      set({ isHydrating: true, error: null })

      try {
        const notes = await fetchNotes()
        const currentNoteId = get().currentNoteId
        const nextNoteId =
          (currentNoteId && notes.some((note) => note.title === currentNoteId)
            ? currentNoteId
            : null) ?? notes[0]?.title

        set({ notes })

        if (!nextNoteId) {
          set({
            ...emptyEditorState,
            isHydrating: false,
            isReading: false
          })

          return
        }

        await readNoteIntoEditor(nextNoteId)
      } catch (error) {
        set({
          isHydrating: false,
          isReading: false,
          error: getErrorMessage(error)
        })
      }
    },

    selectNote: async (noteId) => {
      if (!noteId || noteId === get().currentNoteId) {
        return
      }

      if (!get().notes.some((note) => note.title === noteId)) {
        return
      }

      if (get().hasUnsavedChanges) {
        const didSave = await get().saveCurrentNote()

        if (!didSave) {
          return
        }
      }

      await readNoteIntoEditor(noteId)
    },

    setDraftContent: (content) => {
      set((state) => ({
        draftContent: content,
        hasUnsavedChanges: content !== state.currentNoteContent
      }))
    },

    saveCurrentNote: async () => {
      const { currentNoteId, draftContent, hasUnsavedChanges } = get()

      if (!currentNoteId || !hasUnsavedChanges) {
        return true
      }

      set({ isSaving: true, error: null })

      try {
        await getNoteContext().writeNote(currentNoteId, draftContent)

        set((state) => ({
          isSaving: false,
          currentNoteContent: draftContent,
          draftContent,
          hasUnsavedChanges: false,
          error: null,
          notes: sortNotes(
            state.notes.map((note) =>
              note.title === currentNoteId ? { ...note, lastEditTime: Date.now() } : note
            )
          )
        }))

        return true
      } catch (error) {
        set({
          isSaving: false,
          error: getErrorMessage(error)
        })

        return false
      }
    },

    createNote: async () => {
      if (get().isCreating) {
        return
      }

      const previousTitles = new Set(get().notes.map((note) => note.title))

      set({ isCreating: true, error: null })

      try {
        const createdNote = await getNoteContext().createNote()
        const refreshedNotes = await fetchNotes()
        const createdTitle =
          normalizeTitle(
            createdNote && typeof createdNote === 'object'
              ? (createdNote as Record<string, unknown>).title
              : createdNote
          ) ??
          refreshedNotes.find((note) => !previousTitles.has(note.title))?.title ??
          refreshedNotes[0]?.title

        set({
          notes: refreshedNotes,
          isCreating: false,
          error: null
        })

        if (!createdTitle) {
          set({
            ...emptyEditorState
          })

          return
        }

        await readNoteIntoEditor(createdTitle)
      } catch (error) {
        set({
          isCreating: false,
          error: getErrorMessage(error)
        })
      }
    },

    deleteCurrentNote: async () => {
      const { currentNoteId, notes, isDeleting } = get()

      if (!currentNoteId || isDeleting) {
        return
      }

      const currentIndex = notes.findIndex((note) => note.title === currentNoteId)
      const fallbackSelection =
        notes[currentIndex + 1]?.title ?? notes[currentIndex - 1]?.title ?? null

      set({ isDeleting: true, error: null })

      try {
        await getNoteContext().deleteNote(currentNoteId)

        const refreshedNotes = await fetchNotes()
        const nextNoteId =
          (fallbackSelection &&
          refreshedNotes.some((note) => note.title === fallbackSelection)
            ? fallbackSelection
            : null) ?? refreshedNotes[0]?.title

        set({
          notes: refreshedNotes,
          isDeleting: false,
          error: null
        })

        if (!nextNoteId) {
          set({
            ...emptyEditorState
          })

          return
        }

        await readNoteIntoEditor(nextNoteId)
      } catch (error) {
        set({
          isDeleting: false,
          error: getErrorMessage(error)
        })
      }
    },

    reloadNotes: async () => {
      set({ isHydrating: true, error: null })

      try {
        const refreshedNotes = await fetchNotes()
        const currentNoteId = get().currentNoteId
        const currentStillExists =
          currentNoteId !== null &&
          refreshedNotes.some((note) => note.title === currentNoteId)

        set({
          notes: refreshedNotes,
          isHydrating: false
        })

        if (!refreshedNotes.length) {
          set({
            ...emptyEditorState
          })

          return
        }

        if (!currentStillExists) {
          await readNoteIntoEditor(refreshedNotes[0].title)
        }
      } catch (error) {
        set({
          isHydrating: false,
          error: getErrorMessage(error)
        })
      }
    },

    clearError: () => set({ error: null })
  }
})

export const selectNoteList = (state: NoteStoreState): NoteInfo[] => state.notes

export const selectCurrentNote = (state: NoteStoreState): NoteInfo | null => {
  if (!state.currentNoteId) {
    return null
  }

  return state.notes.find((note) => note.title === state.currentNoteId) ?? null
}

export const selectIsBusy = (state: NoteStoreState): boolean => {
  return (
    state.isHydrating ||
    state.isReading ||
    state.isSaving ||
    state.isCreating ||
    state.isDeleting
  )
}
