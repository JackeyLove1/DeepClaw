import type { ChatEvent } from '@shared/models'
import type {
  CancelRun,
  ClearSessionMessages,
  CreateCronJob,
  CreateNote,
  CreateSession,
  DeleteNote,
  DeleteSession,
  DisconnectWeixinGatewayAccount,
  GetAppPreferences,
  GetAiChannelSettings,
  GetNotes,
  GetThirdPartyApiKeySettings,
  GetUsageOverview,
  GetWeixinGatewayHealth,
  InstallSkill,
  ListCronJobs,
  ListCronRuns,
  ListInstalledSkills,
  ListMcpConnections,
  ListSessions,
  ListSkills,
  ListSkillUsageRecords,
  ListToolCallRecords,
  ToolInstallEvent,
  ListToolInstallTargets,
  ListToolStats,
  ListUsageRecords,
  ListWeixinGatewayAccounts,
  OpenSession,
  PauseCronJob,
  PickPromptFilePath,
  ReadCanvasArtifactHtml,
  ReadClipboardImage,
  ReadNote,
  RemoveCronJob,
  RemoveMcpConnection,
  ResolveChatAttachmentDataUrl,
  ResumeCronJob,
  RunCronJob,
  SaveAiChannelSettings,
  SaveAppPreferences,
  SaveMcpConnection,
  SaveThirdPartyApiKeySettings,
  SearchSessions,
  SearchSkills,
  SendMessage,
  SetActiveAiChannel,
  StartToolInstall,
  StartWeixinQrLogin,
  SubscribeChatEvents,
  SubscribeToolInstallEvents,
  TestAiChannelConnection,
  TestMcpConnections,
  CancelToolInstall,
  Unsubscribe,
  UpdateCronJob,
  UpdateSessionTitle,
  WaitWeixinQrLogin,
  WindowClose,
  WindowIsMaximized,
  WindowMinimize,
  WindowToggleMaximize,
  WriteNote
} from '@shared/types'
import { contextBridge, ipcRenderer } from 'electron'

if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled in the BrowserWindow')
}

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

interface ScriptEvent {
  type: 'start' | 'stdout' | 'stderr' | 'exit'
  script?: string
  data?: string
  code?: number | null
}
type ScriptListener = (event: ScriptEvent) => void
type SubscribeScriptEvents = (listener: ScriptListener) => Unsubscribe

const subscribeScriptEvents: SubscribeScriptEvents = (listener) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: ScriptEvent): void => {
    listener(payload)
  }

  ipcRenderer.on('script:event', wrapped)

  return () => {
    ipcRenderer.removeListener('script:event', wrapped)
  }
}

const subscribeChatEvents: SubscribeChatEvents = (sessionId, listener) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: ChatEvent): void => {
    if (payload.sessionId === sessionId) {
      listener(payload)
    }
  }

  ipcRenderer.on('chat:event', wrapped)

  return () => {
    ipcRenderer.removeListener('chat:event', wrapped)
  }
}

const subscribeToolInstallEvents: SubscribeToolInstallEvents = (listener) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: ToolInstallEvent): void => {
    listener(payload)
  }

  ipcRenderer.on('tools:installEvent', wrapped)

  return () => {
    ipcRenderer.removeListener('tools:installEvent', wrapped)
  }
}

try {
  contextBridge.exposeInMainWorld('context', {
    locale: navigator.language,
    getNotes: (...args: Parameters<GetNotes>) =>
      invoke<Awaited<ReturnType<GetNotes>>>('getNotes', ...args),
    readNote: (...args: Parameters<ReadNote>) =>
      invoke<Awaited<ReturnType<ReadNote>>>('readNote', ...args),
    writeNote: (...args: Parameters<WriteNote>) =>
      invoke<Awaited<ReturnType<WriteNote>>>('writeNote', ...args),
    createNote: (...args: Parameters<CreateNote>) =>
      invoke<Awaited<ReturnType<CreateNote>>>('createNote', ...args),
    deleteNote: (...args: Parameters<DeleteNote>) =>
      invoke<Awaited<ReturnType<DeleteNote>>>('deleteNote', ...args),
    listSessions: (...args: Parameters<ListSessions>) =>
      invoke<Awaited<ReturnType<ListSessions>>>('chat:listSessions', ...args),
    searchSessions: (...args: Parameters<SearchSessions>) =>
      invoke<Awaited<ReturnType<SearchSessions>>>('chat:searchSessions', ...args),
    createSession: (...args: Parameters<CreateSession>) =>
      invoke<Awaited<ReturnType<CreateSession>>>('chat:createSession', ...args),
    openSession: (...args: Parameters<OpenSession>) =>
      invoke<Awaited<ReturnType<OpenSession>>>('chat:openSession', ...args),
    updateSessionTitle: (...args: Parameters<UpdateSessionTitle>) =>
      invoke<Awaited<ReturnType<UpdateSessionTitle>>>('chat:updateSessionTitle', ...args),
    deleteSession: (...args: Parameters<DeleteSession>) =>
      invoke<Awaited<ReturnType<DeleteSession>>>('chat:deleteSession', ...args),
    clearSessionMessages: (...args: Parameters<ClearSessionMessages>) =>
      invoke<Awaited<ReturnType<ClearSessionMessages>>>('chat:clearSessionMessages', ...args),
    sendMessage: (...args: Parameters<SendMessage>) =>
      invoke<Awaited<ReturnType<SendMessage>>>('chat:sendMessage', ...args),
    readClipboardImage: (...args: Parameters<ReadClipboardImage>) =>
      invoke<Awaited<ReturnType<ReadClipboardImage>>>('chat:readClipboardImage', ...args),
    pickPromptFilePath: (...args: Parameters<PickPromptFilePath>) =>
      invoke<Awaited<ReturnType<PickPromptFilePath>>>('chat:pickPromptFilePath', ...args),
    resolveChatAttachmentDataUrl: (...args: Parameters<ResolveChatAttachmentDataUrl>) =>
      invoke<Awaited<ReturnType<ResolveChatAttachmentDataUrl>>>(
        'chat:resolveAttachmentDataUrl',
        ...args
      ),
    readCanvasArtifactHtml: (...args: Parameters<ReadCanvasArtifactHtml>) =>
      invoke<Awaited<ReturnType<ReadCanvasArtifactHtml>>>('chat:readCanvasArtifactHtml', ...args),
    cancelRun: (...args: Parameters<CancelRun>) =>
      invoke<Awaited<ReturnType<CancelRun>>>('chat:cancelRun', ...args),
    subscribeChatEvents,
    subscribeScriptEvents,
    windowMinimize: (...args: Parameters<WindowMinimize>) =>
      invoke<Awaited<ReturnType<WindowMinimize>>>('window:minimize', ...args),
    windowIsMaximized: (...args: Parameters<WindowIsMaximized>) =>
      invoke<Awaited<ReturnType<WindowIsMaximized>>>('window:isMaximized', ...args),
    windowToggleMaximize: (...args: Parameters<WindowToggleMaximize>) =>
      invoke<Awaited<ReturnType<WindowToggleMaximize>>>('window:toggleMaximize', ...args),
    windowClose: (...args: Parameters<WindowClose>) =>
      invoke<Awaited<ReturnType<WindowClose>>>('window:close', ...args),
    getAiChannelSettings: (...args: Parameters<GetAiChannelSettings>) =>
      invoke<Awaited<ReturnType<GetAiChannelSettings>>>('settings:getAiChannels', ...args),
    saveAiChannelSettings: (...args: Parameters<SaveAiChannelSettings>) =>
      invoke<Awaited<ReturnType<SaveAiChannelSettings>>>('settings:saveAiChannels', ...args),
    setActiveAiChannel: (...args: Parameters<SetActiveAiChannel>) =>
      invoke<Awaited<ReturnType<SetActiveAiChannel>>>('settings:setActiveAiChannel', ...args),
    testAiChannelConnection: (...args: Parameters<TestAiChannelConnection>) =>
      invoke<Awaited<ReturnType<TestAiChannelConnection>>>(
        'settings:testAiChannelConnection',
        ...args
      ),
    getThirdPartyApiKeySettings: (...args: Parameters<GetThirdPartyApiKeySettings>) =>
      invoke<Awaited<ReturnType<GetThirdPartyApiKeySettings>>>(
        'settings:getThirdPartyApiKeys',
        ...args
      ),
    saveThirdPartyApiKeySettings: (...args: Parameters<SaveThirdPartyApiKeySettings>) =>
      invoke<Awaited<ReturnType<SaveThirdPartyApiKeySettings>>>(
        'settings:saveThirdPartyApiKeys',
        ...args
      ),
    getAppPreferences: (...args: Parameters<GetAppPreferences>) =>
      invoke<Awaited<ReturnType<GetAppPreferences>>>('settings:getAppPreferences', ...args),
    saveAppPreferences: (...args: Parameters<SaveAppPreferences>) =>
      invoke<Awaited<ReturnType<SaveAppPreferences>>>('settings:saveAppPreferences', ...args),
    listWeixinGatewayAccounts: (...args: Parameters<ListWeixinGatewayAccounts>) =>
      invoke<Awaited<ReturnType<ListWeixinGatewayAccounts>>>('weixin:listAccounts', ...args),
    startWeixinQrLogin: (...args: Parameters<StartWeixinQrLogin>) =>
      invoke<Awaited<ReturnType<StartWeixinQrLogin>>>('weixin:qrStart', ...args),
    waitWeixinQrLogin: (...args: Parameters<WaitWeixinQrLogin>) =>
      invoke<Awaited<ReturnType<WaitWeixinQrLogin>>>('weixin:qrWait', ...args),
    disconnectWeixinGatewayAccount: (...args: Parameters<DisconnectWeixinGatewayAccount>) =>
      invoke<Awaited<ReturnType<DisconnectWeixinGatewayAccount>>>('weixin:disconnect', ...args),
    getWeixinGatewayHealth: (...args: Parameters<GetWeixinGatewayHealth>) =>
      invoke<Awaited<ReturnType<GetWeixinGatewayHealth>>>('weixin:health', ...args),
    getUsageOverview: (...args: Parameters<GetUsageOverview>) =>
      invoke<Awaited<ReturnType<GetUsageOverview>>>('settings:getUsageOverview', ...args),
    listUsageRecords: (...args: Parameters<ListUsageRecords>) =>
      invoke<Awaited<ReturnType<ListUsageRecords>>>('settings:listUsageRecords', ...args),
    listToolCallRecords: (...args: Parameters<ListToolCallRecords>) =>
      invoke<Awaited<ReturnType<ListToolCallRecords>>>('settings:listToolCallRecords', ...args),
    listToolStats: (...args: Parameters<ListToolStats>) =>
      invoke<Awaited<ReturnType<ListToolStats>>>('settings:listToolStats', ...args),
    listSkillUsageRecords: (...args: Parameters<ListSkillUsageRecords>) =>
      invoke<Awaited<ReturnType<ListSkillUsageRecords>>>('settings:listSkillUsageRecords', ...args),
    listInstalledSkills: (...args: Parameters<ListInstalledSkills>) =>
      invoke<Awaited<ReturnType<ListInstalledSkills>>>('chat:listInstalledSkills', ...args),
    searchSkills: (...args: Parameters<SearchSkills>) =>
      invoke<Awaited<ReturnType<SearchSkills>>>('chat:searchSkills', ...args),
    installSkill: (...args: Parameters<InstallSkill>) =>
      invoke<Awaited<ReturnType<InstallSkill>>>('chat:installSkill', ...args),
    listSkills: (...args: Parameters<ListSkills>) =>
      invoke<Awaited<ReturnType<ListSkills>>>('chat:listSkills', ...args),
    listCronJobs: (...args: Parameters<ListCronJobs>) =>
      invoke<Awaited<ReturnType<ListCronJobs>>>('cron:listJobs', ...args),
    listCronRuns: (...args: Parameters<ListCronRuns>) =>
      invoke<Awaited<ReturnType<ListCronRuns>>>('cron:listRuns', ...args),
    createCronJob: (...args: Parameters<CreateCronJob>) =>
      invoke<Awaited<ReturnType<CreateCronJob>>>('cron:createJob', ...args),
    updateCronJob: (...args: Parameters<UpdateCronJob>) =>
      invoke<Awaited<ReturnType<UpdateCronJob>>>('cron:updateJob', ...args),
    pauseCronJob: (...args: Parameters<PauseCronJob>) =>
      invoke<Awaited<ReturnType<PauseCronJob>>>('cron:pauseJob', ...args),
    resumeCronJob: (...args: Parameters<ResumeCronJob>) =>
      invoke<Awaited<ReturnType<ResumeCronJob>>>('cron:resumeJob', ...args),
    removeCronJob: (...args: Parameters<RemoveCronJob>) =>
      invoke<Awaited<ReturnType<RemoveCronJob>>>('cron:removeJob', ...args),
    runCronJob: (...args: Parameters<RunCronJob>) =>
      invoke<Awaited<ReturnType<RunCronJob>>>('cron:runJob', ...args),
    listToolInstallTargets: (...args: Parameters<ListToolInstallTargets>) =>
      invoke<Awaited<ReturnType<ListToolInstallTargets>>>('tools:listInstallTargets', ...args),
    startToolInstall: (...args: Parameters<StartToolInstall>) =>
      invoke<Awaited<ReturnType<StartToolInstall>>>('tools:startInstall', ...args),
    cancelToolInstall: (...args: Parameters<CancelToolInstall>) =>
      invoke<Awaited<ReturnType<CancelToolInstall>>>('tools:cancelInstall', ...args),
    listMcpConnections: (...args: Parameters<ListMcpConnections>) =>
      invoke<Awaited<ReturnType<ListMcpConnections>>>('mcp:listConnections', ...args),
    saveMcpConnection: (...args: Parameters<SaveMcpConnection>) =>
      invoke<Awaited<ReturnType<SaveMcpConnection>>>('mcp:saveConnection', ...args),
    removeMcpConnection: (...args: Parameters<RemoveMcpConnection>) =>
      invoke<Awaited<ReturnType<RemoveMcpConnection>>>('mcp:removeConnection', ...args),
    testMcpConnections: (...args: Parameters<TestMcpConnections>) =>
      invoke<Awaited<ReturnType<TestMcpConnections>>>('mcp:testConnections', ...args),
    subscribeToolInstallEvents
  })
} catch (error) {
  console.error(error)
}
