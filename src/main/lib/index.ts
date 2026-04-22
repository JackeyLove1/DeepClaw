import { appDirectoryName, fileEncoding, welcomeNoteFilename } from '@shared/constants'
import { NoteInfo } from '@shared/models'
import { CreateNote, DeleteNote, GetNotes, ReadNote, WriteNote } from '@shared/types'
import { deleteNoteByTitle, getAllNotes, insertNote, updateNoteTimestamp } from './database'
import { dialog } from 'electron'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { isEmpty } from 'lodash'
import { homedir } from 'os'
import path from 'path'
import welcomeNoteFile from '../../../resources/welcomeNote.md?asset'
import { getAppPreferences } from './app-preferences'

interface MainDialogText {
  newNoteTitle: string
  untitledFilename: string
  create: string
  creationFailed: string
  wrongDirectory: (rootDir: string) => string
  deleteNoteTitle: string
  deleteNoteMessage: (filename: string) => string
  delete: string
  cancel: string
}

const mainDialogText: Record<'zh-CN' | 'en-US', MainDialogText> = {
  'zh-CN': {
    newNoteTitle: '新建笔记',
    untitledFilename: '未命名.md',
    create: '创建',
    creationFailed: '创建失败',
    wrongDirectory: (rootDir: string) => `所有笔记都必须保存在 ${rootDir} 下。\n请不要使用其他目录。`,
    deleteNoteTitle: '删除笔记',
    deleteNoteMessage: (filename: string) => `确定要删除 ${filename} 吗？`,
    delete: '删除',
    cancel: '取消'
  },
  'en-US': {
    newNoteTitle: 'New note',
    untitledFilename: 'Untitled.md',
    create: 'Create',
    creationFailed: 'Creation failed',
    wrongDirectory: (rootDir: string) =>
      `All notes must be saved under ${rootDir}.\nAvoid using other directories!`,
    deleteNoteTitle: 'Delete note',
    deleteNoteMessage: (filename: string) => `Are you sure you want to delete ${filename}?`,
    delete: 'Delete',
    cancel: 'Cancel'
  }
}

const getMainDialogText = async (): Promise<MainDialogText> => {
  const preferences = await getAppPreferences()
  return mainDialogText[preferences.locale] ?? mainDialogText['zh-CN']
}

export const getRootDir = () => {
  return `${homedir()}/${appDirectoryName}`
}

export const getNotes: GetNotes = async () => {
  const rootDir = getRootDir()

  await mkdir(rootDir, { recursive: true })

  // Try to get notes from database first
  let notes = getAllNotes()

  // If database is empty (first run), scan file system and populate database
  if (isEmpty(notes)) {
    console.info('[Notes] Database empty, scanning file system')

    const notesFileNames = await readdir(rootDir, {
      encoding: fileEncoding,
      withFileTypes: false
    })

    const mdFiles = notesFileNames.filter((fileName) => fileName.endsWith('.md'))

    if (isEmpty(mdFiles)) {
      console.info('[Notes] No notes found, creating a welcome note')

      const content = await readFile(welcomeNoteFile, { encoding: fileEncoding })

      // create the welcome note
      await writeFile(`${rootDir}/${welcomeNoteFilename}`, content, { encoding: fileEncoding })

      const stats = await stat(`${rootDir}/${welcomeNoteFilename}`)
      insertNote(welcomeNoteFilename.replace(/\.md$/, ''), stats.mtimeMs)
      notes = [
        { id: 1, title: welcomeNoteFilename.replace(/\.md$/, ''), lastEditTime: stats.mtimeMs }
      ]
    } else {
      // Populate database from file system
      for (const filename of mdFiles) {
        const stats = await stat(`${rootDir}/${filename}`)
        insertNote(filename.replace(/\.md$/, ''), stats.mtimeMs)
      }
      notes = getAllNotes()
    }
  }

  return notes.map((note) => ({
    title: note.title,
    lastEditTime: note.lastEditTime
  }))
}

export const getNoteInfoFromFilename = async (filename: string): Promise<NoteInfo> => {
  const fileStats = await stat(`${getRootDir()}/${filename}`)

  return {
    title: filename.replace(/\.md$/, ''),
    lastEditTime: fileStats.mtimeMs
  }
}

export const readNote: ReadNote = async (filename) => {
  const rootDir = getRootDir()

  return readFile(`${rootDir}/${filename}.md`, { encoding: fileEncoding })
}

export const writeNote: WriteNote = async (filename, content) => {
  const rootDir = getRootDir()

  console.info(`Writing note ${filename}`)
  await writeFile(`${rootDir}/${filename}.md`, content, { encoding: fileEncoding })

  // Update timestamp in database
  const stats = await stat(`${rootDir}/${filename}.md`)
  updateNoteTimestamp(filename, stats.mtimeMs)
}

export const createNote: CreateNote = async () => {
  const rootDir = getRootDir()
  const text = await getMainDialogText()

  await mkdir(rootDir, { recursive: true })

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: text.newNoteTitle,
    defaultPath: `${rootDir}/${text.untitledFilename}`,
    buttonLabel: text.create,
    properties: ['showOverwriteConfirmation'],
    showsTagField: false,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })

  if (canceled || !filePath) {
    console.info('Note creation canceled')
    return false
  }

  const { name: filename, dir: parentDir } = path.parse(filePath)

  if (parentDir !== rootDir) {
    await dialog.showMessageBox({
      type: 'error',
      title: text.creationFailed,
      message: text.wrongDirectory(rootDir)
    })

    return false
  }

  console.info(`Creating note: ${filePath}`)
  await writeFile(filePath, '')

  // Add to database
  const stats = await stat(filePath)
  insertNote(filename, stats.mtimeMs)

  return filename
}

export const deleteNote: DeleteNote = async (filename) => {
  const rootDir = getRootDir()
  const text = await getMainDialogText()

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: text.deleteNoteTitle,
    message: text.deleteNoteMessage(filename),
    buttons: [text.delete, text.cancel], // 0 is Delete, 1 is Cancel
    defaultId: 1,
    cancelId: 1
  })

  if (response === 1) {
    console.info('Note deletion canceled')
    return false
  }

  console.info(`Deleting note: ${filename}`)
  await rm(`${rootDir}/${filename}.md`, { force: true })

  // Remove from database
  deleteNoteByTitle(filename)

  return true
}
