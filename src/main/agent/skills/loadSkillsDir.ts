import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_FILE_NAME = 'SKILL.md'

export interface InstalledSkill {
  skillId: string
  name: string
  description: string
  skillDir: string
  skillFilePath: string
  body: string
  tags: string[]
}

export interface SeedSkillsResult {
  sourceDir: string | null
  userDir: string
  copiedFiles: number
  skippedFiles: number
}

type SeedSkillsOptions = {
  bundledSkillsDir?: string | null
  userSkillsDir?: string
}

type ParsedFrontmatter = {
  name: string
  description: string
  tags: string[]
  body: string
}

const normalizeSkillId = (value: string): string =>
  value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

const expandUserHome = (targetPath: string): string => {
  if (targetPath === '~') {
    return os.homedir()
  }

  if (targetPath.startsWith('~/') || targetPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), targetPath.slice(2))
  }

  return targetPath
}

const resolveRealPath = (targetPath: string): string => {
  const expandedPath = expandUserHome(targetPath)
  try {
    return fs.realpathSync(expandedPath)
  } catch {
    return path.resolve(expandedPath)
  }
}

const parseInlineArray = (value: string): string[] => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return []
  }

  return trimmed
    .slice(1, -1)
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

const parseScalarValue = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

const parseFrontmatter = (source: string): ParsedFrontmatter | null => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return null
  }

  const [, frontmatter, body = ''] = match
  let name = ''
  let description = ''
  let tags: string[] = []

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    if (trimmed.startsWith('name:')) {
      name = parseScalarValue(trimmed.slice('name:'.length))
      continue
    }

    if (trimmed.startsWith('description:')) {
      description = parseScalarValue(trimmed.slice('description:'.length))
      continue
    }

    if (trimmed.startsWith('tags:')) {
      const inlineTags = parseInlineArray(trimmed.slice('tags:'.length))
      if (inlineTags.length > 0) {
        tags = inlineTags
      }
    }
  }

  if (!name || !description) {
    return null
  }

  return {
    name,
    description,
    tags,
    body
  }
}

const walkFiles = (rootDir: string): string[] => {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const files: string[] = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const currentDir = stack.pop()
    if (!currentDir) {
      continue
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  return files
}

const copyTreeSkipExisting = (
  sourceDir: string,
  targetDir: string,
  counters: { copiedFiles: number; skippedFiles: number }
): void => {
  fs.mkdirSync(targetDir, { recursive: true })

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
        counters.skippedFiles += 1
        continue
      }
      copyTreeSkipExisting(sourcePath, targetPath, counters)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (fs.existsSync(targetPath)) {
      counters.skippedFiles += 1
      continue
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.copyFileSync(sourcePath, targetPath)
    counters.copiedFiles += 1
  }
}

export const getUserSkillsDir = (homeDir = os.homedir()): string =>
  path.join(homeDir, '.deepclaw', 'skills')

export const resolveBundledSkillsDir = (): string | null => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(moduleDir, 'default'),
    path.resolve(process.cwd(), 'src', 'main', 'agent', 'skills', 'default')
  ]

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'skills', 'default'))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return resolveRealPath(candidate)
    }
  }

  return null
}

export const seedBundledSkillsIntoUserDir = (
  options: SeedSkillsOptions = {}
): SeedSkillsResult => {
  const sourceDir = options.bundledSkillsDir ?? resolveBundledSkillsDir()
  const userDir = options.userSkillsDir ?? getUserSkillsDir()

  fs.mkdirSync(userDir, { recursive: true })

  const counters = {
    copiedFiles: 0,
    skippedFiles: 0
  }

  if (!sourceDir) {
    return {
      sourceDir: null,
      userDir,
      ...counters
    }
  }

  copyTreeSkipExisting(sourceDir, userDir, counters)

  return {
    sourceDir,
    userDir,
    ...counters
  }
}

export const loadInstalledSkillsFromDir = (
  userSkillsDir: string = getUserSkillsDir()
): InstalledSkill[] => {
  if (!fs.existsSync(userSkillsDir)) {
    return []
  }

  const skillFiles = walkFiles(userSkillsDir)
    .filter((filePath) => path.basename(filePath) === SKILL_FILE_NAME)
    .sort((left, right) => left.localeCompare(right))

  const loadedSkills: InstalledSkill[] = []
  for (const skillFile of skillFiles) {
    try {
      const source = fs.readFileSync(skillFile, 'utf8')
      const parsed = parseFrontmatter(source)
      if (!parsed) {
        console.warn(`[skills] Skipping malformed skill file: ${skillFile}`)
        continue
      }

      const relativeSkillDir = path.relative(userSkillsDir, path.dirname(skillFile))
      const skillId = normalizeSkillId(relativeSkillDir || path.basename(path.dirname(skillFile)))
      if (!skillId) {
        console.warn(`[skills] Skipping skill without a resolvable id: ${skillFile}`)
        continue
      }

      loadedSkills.push({
        skillId,
        name: parsed.name,
        description: parsed.description,
        skillDir: resolveRealPath(path.dirname(skillFile)),
        skillFilePath: resolveRealPath(skillFile),
        body: parsed.body.trim(),
        tags: parsed.tags
      })
    } catch (error) {
      console.warn(`[skills] Failed to load skill: ${skillFile}`, error)
    }
  }

  return loadedSkills
}

export const findInstalledSkillByFilePath = (
  filePath: string,
  installedSkills: readonly InstalledSkill[]
): InstalledSkill | null => {
  const resolvedPath = resolveRealPath(filePath)
  return installedSkills.find((skill) => skill.skillFilePath === resolvedPath) ?? null
}
