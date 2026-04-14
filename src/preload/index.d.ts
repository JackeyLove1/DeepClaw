import type {
  CancelRun,
  CreateNote,
  CreateSession,
  DeleteNote,
  GetNotes,
  ListSessions,
  OpenSession,
  ReadNote,
  SendMessage,
  SubscribeChatEvents,
  WindowClose,
  WindowIsMaximized,
  WindowMinimize,
  WindowToggleMaximize,
  WriteNote
} from '@shared/types'

declare global {
  interface Window {
    context: {
      locale: string
      getNotes: GetNotes
      readNote: ReadNote
      writeNote: WriteNote
      createNote: CreateNote
      deleteNote: DeleteNote
      listSessions: ListSessions
      createSession: CreateSession
      openSession: OpenSession
      sendMessage: SendMessage
      cancelRun: CancelRun
      subscribeChatEvents: SubscribeChatEvents
      windowMinimize: WindowMinimize
      windowIsMaximized: WindowIsMaximized
      windowToggleMaximize: WindowToggleMaximize
      windowClose: WindowClose
    }
  }
}

export {}
