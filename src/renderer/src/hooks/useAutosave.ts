import { useEffect } from 'react'

import { useNoteStore } from '../store/noteStore'

const AUTOSAVE_DELAY_MS = 1500

export const useAutosave = (): void => {
  const currentNoteId = useNoteStore((state) => state.currentNoteId)
  const draftContent = useNoteStore((state) => state.draftContent)
  const hasUnsavedChanges = useNoteStore((state) => state.hasUnsavedChanges)
  const isHydrating = useNoteStore((state) => state.isHydrating)
  const isReading = useNoteStore((state) => state.isReading)
  const isSaving = useNoteStore((state) => state.isSaving)
  const isCreating = useNoteStore((state) => state.isCreating)
  const isDeleting = useNoteStore((state) => state.isDeleting)
  const saveCurrentNote = useNoteStore((state) => state.saveCurrentNote)

  useEffect(() => {
    if (
      !currentNoteId ||
      !hasUnsavedChanges ||
      isHydrating ||
      isReading ||
      isSaving ||
      isCreating ||
      isDeleting
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void saveCurrentNote()
    }, AUTOSAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    currentNoteId,
    draftContent,
    hasUnsavedChanges,
    isHydrating,
    isReading,
    isSaving,
    isCreating,
    isDeleting,
    saveCurrentNote
  ])
}
