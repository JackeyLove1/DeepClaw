import { CreateNote, DeleteNote, GetNotes, ReadNote, WriteNote } from '@shared/types'

declare global {
  interface Window {
    // electron: ElectronAPI
    context: {
      locale: string
      getNotes: GetNotes
      readNote: ReadNote
      writeNote: WriteNote
      createNote: CreateNote
      deleteNote: DeleteNote
      windowMinimize: () => Promise<void>
      windowToggleMaximize: () => Promise<boolean>
      windowIsMaximized: () => Promise<boolean>
      windowClose: () => Promise<void>
    }
  }
}
