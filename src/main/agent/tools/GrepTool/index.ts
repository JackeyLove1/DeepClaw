import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { isWindows, resolveDefaultWorkingDir } from '../../utils'
import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolExecuteResult } from '../types'
import {
  checkInternalReadBlocked,
  clampSummary,
  expandUser,
  hasBinaryExtension,
  isBlockedDevicePath,
  jsonResult,
  redactSensitiveText
} from '../FileSystemTool/utils'
import { grepInputSchema, type GrepInput } from './input'

const VCS_DIRECTORIES_TO_EXCLUDE = new Set(['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'])
const HEAVY_DIRECTORIES_TO_EXCLUDE = new Set(['node_modules', 'dist', 'out', 'build', '.next'])
const DEFAULT_HEAD_LIMIT = 250
const MAX_COLUMN_CHARS = 500
const MAX_RG_BUFFER_BYTES = 8 * 1024 * 1024
const RG_TIMEOUT_MS = 30_000

const TYPE_EXTENSIONS: Record<string, string[]> = {
  css: ['.css'],
  go: ['.go'],
  html: ['.html', '.htm'],
  java: ['.java'],
  js: ['.js', '.cjs', '.mjs'],
  json: ['.json', '.jsonc'],
  jsx: ['.jsx'],
  md: ['.md', '.markdown', '.mdx'],
  py: ['.py'],
  rs: ['.rs'],
  ts: ['.ts', '.cts', '.mts'],
  tsx: ['.tsx']
}

type OutputMode = 'content' | 'files_with_matches' | 'count'
type Backend = 'ripgrep' | 'typescript'

type GrepPayload = {
  mode: OutputMode
  backend: Backend
  num_files: number
  filenames: string[]
  content?: string
  num_lines?: number
  num_matches?: number
  applied_limit?: number
  applied_offset?: number
}

type SearchScope = {
  absolutePath: string
  searchRoot: string
  target: string
  isFile: boolean
}

export type RipgrepResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  failedToStart: boolean
}

export type RipgrepRunner = (args: string[], cwd: string) => Promise<RipgrepResult>

export type GrepToolOptions = {
  platform?: NodeJS.Platform
  runRipgrep?: RipgrepRunner
}

const grepOutputSchema = lazySchema(() => toolExecuteResultSchema)

const defaultRipgrepAvailability = new Map<string, Promise<boolean>>()

function makeResult(
  payload: GrepPayload | { error: string; [key: string]: unknown }
): ToolExecuteResult {
  const text = jsonResult(payload)
  const summary =
    'error' in payload
      ? `grep failed: ${String(payload.error)}`
      : `grep ${payload.mode} via ${payload.backend}: ${payload.num_files} file(s)`

  return {
    content: [{ type: 'text', text }],
    details: {
      summary: clampSummary(summary, 1200),
      ...payload
    }
  }
}

function defaultRunRipgrep(
  args: string[],
  cwd: string,
  platform: NodeJS.Platform = process.platform
): Promise<RipgrepResult> {
  return new Promise((resolve) => {
    execFile(
      isWindows(platform) ? 'rg.exe' : 'rg',
      args,
      {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_RG_BUFFER_BYTES,
        timeout: RG_TIMEOUT_MS
      },
      (error, stdout, stderr) => {
        const typedError = error as
          | (Error & { code?: number | string; killed?: boolean; signal?: NodeJS.Signals })
          | null

        resolve({
          stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
          stderr:
            (typeof stderr === 'string' ? stderr : String(stderr ?? '')) ||
            (typedError?.message ?? ''),
          exitCode: typeof typedError?.code === 'number' ? typedError.code : error ? null : 0,
          failedToStart: Boolean(typedError) && typedError?.code === 'ENOENT'
        })
      }
    )
  })
}

async function isRipgrepAvailable(
  runRipgrep: RipgrepRunner,
  cwd: string,
  useDefaultRunner: boolean,
  cacheKey: string
): Promise<boolean> {
  if (useDefaultRunner) {
    let cached = defaultRipgrepAvailability.get(cacheKey)
    if (!cached) {
      cached = runRipgrep(['--version'], cwd).then(
        (result) => !result.failedToStart && result.exitCode === 0,
        () => false
      )
      defaultRipgrepAvailability.set(cacheKey, cached)
    }
    return cached
  }

  try {
    const result = await runRipgrep(['--version'], cwd)
    return !result.failedToStart && result.exitCode === 0
  } catch {
    return false
  }
}

function normalizePathForDisplay(input: string): string {
  return input.replace(/\\/g, '/')
}

function toDisplayPath(absoluteFilePath: string): string {
  const base = resolveDefaultWorkingDir()
  const relative = path.relative(base, absoluteFilePath)
  const display =
    relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : absoluteFilePath
  return normalizePathForDisplay(display || '.')
}

function resolveInputPath(inputPath: string | undefined): string {
  if (!inputPath?.trim()) {
    return resolveDefaultWorkingDir()
  }

  const expanded = expandUser(inputPath.trim())
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(resolveDefaultWorkingDir(), expanded)
}

async function resolveSearchScope(
  inputPath: string | undefined
): Promise<SearchScope | { error: string }> {
  const absolutePath = resolveInputPath(inputPath)

  if (isBlockedDevicePath(absolutePath)) {
    return {
      error: `Cannot search '${inputPath ?? absolutePath}': this path is a device or special file.`
    }
  }

  let stat: fs.Stats
  try {
    stat = await fsp.stat(absolutePath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { error: `Path does not exist: ${inputPath ?? absolutePath}` }
    }
    return { error: error instanceof Error ? error.message : String(error) }
  }

  const isFile = stat.isFile()
  const searchRoot = isFile ? path.dirname(absolutePath) : absolutePath
  const target = isFile ? path.basename(absolutePath) : '.'

  return {
    absolutePath,
    searchRoot,
    target,
    isFile
  }
}

function applyHeadLimit<T>(
  items: T[],
  limit: number | undefined,
  offset = 0
): { items: T[]; appliedLimit?: number; appliedOffset?: number } {
  const normalizedOffset = Math.max(0, offset)
  if (limit === 0) {
    return {
      items: items.slice(normalizedOffset),
      ...(normalizedOffset > 0 && { appliedOffset: normalizedOffset })
    }
  }

  const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT
  const sliced = items.slice(normalizedOffset, normalizedOffset + effectiveLimit)
  const wasTruncated = items.length - normalizedOffset > effectiveLimit
  return {
    items: sliced,
    ...(wasTruncated && { appliedLimit: effectiveLimit }),
    ...(normalizedOffset > 0 && { appliedOffset: normalizedOffset })
  }
}

function splitGlobPatterns(glob: string | undefined): string[] {
  if (!glob?.trim()) {
    return []
  }

  const patterns: string[] = []
  for (const raw of glob.split(/\s+/)) {
    if (!raw) {
      continue
    }
    if (raw.includes('{') && raw.includes('}')) {
      patterns.push(raw)
      continue
    }
    patterns.push(...raw.split(',').filter(Boolean))
  }
  return patterns.flatMap(expandBracePattern)
}

function expandBracePattern(pattern: string): string[] {
  const match = pattern.match(/^(.*)\{([^{}]+)\}(.*)$/)
  if (!match) {
    return [pattern]
  }

  const [, before, body, after] = match
  return body.split(',').flatMap((part) => expandBracePattern(`${before}${part}${after}`))
}

function escapeRegexChar(char: string): string {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizePathForDisplay(glob)
  let source = '^'
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '*' && next === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegexChar(char)
    }
  }

  return new RegExp(`${source}$`)
}

function compileGlobMatchers(glob: string | undefined): Array<{ raw: string; regex: RegExp }> {
  return splitGlobPatterns(glob).map((raw) => ({ raw, regex: globToRegExp(raw) }))
}

function fileMatchesGlob(
  relativePath: string,
  matchers: Array<{ raw: string; regex: RegExp }>
): boolean {
  if (matchers.length === 0) {
    return true
  }

  const normalizedRelative = normalizePathForDisplay(relativePath)
  const basename = path.basename(normalizedRelative)
  return matchers.some(({ raw, regex }) => {
    const normalizedRaw = normalizePathForDisplay(raw)
    return normalizedRaw.includes('/')
      ? regex.test(normalizedRelative)
      : regex.test(basename) || regex.test(normalizedRelative)
  })
}

function fileMatchesType(filePath: string, type: string | undefined): boolean {
  if (!type?.trim()) {
    return true
  }

  const extensions = TYPE_EXTENSIONS[type.trim().toLowerCase()]
  if (!extensions) {
    return true
  }

  return extensions.includes(path.extname(filePath).toLowerCase())
}

function truncateLine(line: string): string {
  if (line.length <= MAX_COLUMN_CHARS) {
    return line
  }

  return `${line.slice(0, MAX_COLUMN_CHARS)}...`
}

function compileSearchRegExp(pattern: string, caseInsensitive: boolean, global: boolean): RegExp {
  const flags = `${global ? 'g' : ''}${caseInsensitive ? 'i' : ''}`
  return new RegExp(pattern, flags)
}

function countMatches(text: string, regex: RegExp): number {
  regex.lastIndex = 0
  let count = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    count += 1
    if (match[0] === '') {
      regex.lastIndex += 1
    }
  }
  return count
}

function lineNumberForIndex(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      line += 1
    }
  }
  return line
}

function buildLineOutput(
  displayPath: string,
  lineNumber: number,
  line: string,
  showLineNumbers: boolean
): string {
  const cleanLine = redactSensitiveText(truncateLine(line))
  return showLineNumbers
    ? `${displayPath}:${lineNumber}:${cleanLine}`
    : `${displayPath}:${cleanLine}`
}

function getContextRadius(params: GrepInput): { before: number; after: number } {
  if (params.context !== undefined) {
    return { before: params.context, after: params.context }
  }
  if (params['-C'] !== undefined) {
    return { before: params['-C'], after: params['-C'] }
  }
  return {
    before: params['-B'] ?? 0,
    after: params['-A'] ?? 0
  }
}

async function collectSearchFiles(scope: SearchScope, params: GrepInput): Promise<string[]> {
  const globMatchers = compileGlobMatchers(params.glob)
  const files: string[] = []

  async function shouldIncludeFile(filePath: string): Promise<boolean> {
    if (hasBinaryExtension(filePath) || !fileMatchesType(filePath, params.type)) {
      return false
    }

    const relative = path.relative(scope.searchRoot, filePath) || path.basename(filePath)
    if (!fileMatchesGlob(relative, globMatchers)) {
      return false
    }

    let resolved = filePath
    try {
      resolved = await fsp.realpath(filePath)
    } catch {
      // Keep the unresolved path; read errors are handled later.
    }

    return checkInternalReadBlocked(resolved, filePath) === null
  }

  if (scope.isFile) {
    if (await shouldIncludeFile(scope.absolutePath)) {
      files.push(scope.absolutePath)
    }
    return files
  }

  async function visit(dir: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (
          VCS_DIRECTORIES_TO_EXCLUDE.has(entry.name) ||
          HEAVY_DIRECTORIES_TO_EXCLUDE.has(entry.name)
        ) {
          continue
        }
        if (checkInternalReadBlocked(entryPath, entryPath) !== null) {
          continue
        }
        await visit(entryPath)
        continue
      }

      if (entry.isFile() && (await shouldIncludeFile(entryPath))) {
        files.push(entryPath)
      }
    }
  }

  await visit(scope.searchRoot)
  return files
}

async function runTypescriptSearch(scope: SearchScope, params: GrepInput): Promise<GrepPayload> {
  const mode = params.output_mode ?? 'files_with_matches'
  const showLineNumbers = params['-n'] ?? true
  const caseInsensitive = params['-i'] ?? false
  const { before, after } = getContextRadius(params)
  const files = await collectSearchFiles(scope, params)
  const matchedFiles = new Set<string>()
  const contentLines: string[] = []
  const countLines: string[] = []
  let totalMatches = 0

  const lineRegex = compileSearchRegExp(params.pattern, caseInsensitive, false)
  const countRegex = compileSearchRegExp(params.pattern, caseInsensitive, true)
  const multilineRegex = new RegExp(params.pattern, `g${caseInsensitive ? 'i' : ''}ms`)

  for (const filePath of files) {
    let raw: string
    try {
      raw = await fsp.readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const displayPath = toDisplayPath(filePath)

    if (params.multiline) {
      const matchCount = countMatches(raw, multilineRegex)
      if (matchCount === 0) {
        continue
      }

      matchedFiles.add(filePath)
      totalMatches += matchCount

      if (mode === 'count') {
        countLines.push(`${displayPath}:${matchCount}`)
      } else if (mode === 'content') {
        const lines = raw.split(/\r?\n/)
        const included = new Set<number>()
        multilineRegex.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = multilineRegex.exec(raw)) !== null) {
          const lineIndex = lineNumberForIndex(raw, match.index) - 1
          const start = Math.max(0, lineIndex - before)
          const end = Math.min(lines.length - 1, lineIndex + after)
          for (let index = start; index <= end; index++) {
            included.add(index)
          }
          if (match[0] === '') {
            multilineRegex.lastIndex += 1
          }
        }

        for (const index of [...included].sort((a, b) => a - b)) {
          contentLines.push(
            buildLineOutput(displayPath, index + 1, lines[index] ?? '', showLineNumbers)
          )
        }
      }
      continue
    }

    const lines = raw.split(/\r?\n/)
    const matchedLineIndexes: number[] = []
    let fileMatchCount = 0
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      lineRegex.lastIndex = 0
      if (lineRegex.test(line)) {
        matchedLineIndexes.push(index)
      }
      fileMatchCount += countMatches(line, countRegex)
    }

    if (fileMatchCount === 0) {
      continue
    }

    matchedFiles.add(filePath)
    totalMatches += fileMatchCount

    if (mode === 'count') {
      countLines.push(`${displayPath}:${fileMatchCount}`)
    } else if (mode === 'content') {
      const included = new Set<number>()
      for (const index of matchedLineIndexes) {
        const start = Math.max(0, index - before)
        const end = Math.min(lines.length - 1, index + after)
        for (let includedIndex = start; includedIndex <= end; includedIndex++) {
          included.add(includedIndex)
        }
      }

      for (const index of [...included].sort((a, b) => a - b)) {
        contentLines.push(
          buildLineOutput(displayPath, index + 1, lines[index] ?? '', showLineNumbers)
        )
      }
    }
  }

  if (mode === 'content') {
    const limited = applyHeadLimit(contentLines, params.head_limit, params.offset ?? 0)
    return {
      mode,
      backend: 'typescript',
      num_files: matchedFiles.size,
      filenames: [...matchedFiles].map(toDisplayPath).sort(),
      content: limited.items.join('\n'),
      num_lines: limited.items.length,
      ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
      ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
    }
  }

  if (mode === 'count') {
    const limited = applyHeadLimit(countLines, params.head_limit, params.offset ?? 0)
    let limitedMatches = 0
    for (const line of limited.items) {
      const colonIndex = line.lastIndexOf(':')
      const count = Number(line.slice(colonIndex + 1))
      if (Number.isFinite(count)) {
        limitedMatches += count
      }
    }

    return {
      mode,
      backend: 'typescript',
      num_files: limited.items.length,
      filenames: [],
      content: redactSensitiveText(limited.items.join('\n')),
      num_matches: limitedMatches,
      ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
      ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
    }
  }

  const stats = await Promise.allSettled([...matchedFiles].map((filePath) => fsp.stat(filePath)))
  const sorted = [...matchedFiles]
    .map((filePath, index) => {
      const stat = stats[index]
      return [filePath, stat?.status === 'fulfilled' ? stat.value.mtimeMs : 0] as const
    })
    .sort((left, right) => {
      if (process.env.NODE_ENV === 'test') {
        return left[0].localeCompare(right[0])
      }
      const time = right[1] - left[1]
      return time === 0 ? left[0].localeCompare(right[0]) : time
    })
    .map(([filePath]) => filePath)
  const limited = applyHeadLimit(sorted, params.head_limit, params.offset ?? 0)
  const filenames = limited.items.map(toDisplayPath)

  return {
    mode,
    backend: 'typescript',
    num_files: filenames.length,
    filenames,
    ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
    ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
  }
}

function buildRipgrepArgs(params: GrepInput, mode: OutputMode): string[] {
  const args = ['--hidden', '--max-columns', String(MAX_COLUMN_CHARS)]

  for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
    args.push('--glob', `!${dir}`)
  }

  if (params.multiline) {
    args.push('-U', '--multiline-dotall')
  }

  if (params['-i']) {
    args.push('-i')
  }

  if (mode === 'content') {
    args.push('--json')
    const showLineNumbers = params['-n'] ?? true
    if (showLineNumbers) {
      args.push('-n')
    }

    const { before, after } = getContextRadius(params)
    if (before === after && before > 0) {
      args.push('-C', String(before))
    } else {
      if (before > 0) {
        args.push('-B', String(before))
      }
      if (after > 0) {
        args.push('-A', String(after))
      }
    }
  } else if (mode === 'files_with_matches') {
    args.push('-l')
  } else {
    args.push('-c')
  }

  if (params.type) {
    args.push('--type', params.type)
  }

  for (const globPattern of splitGlobPatterns(params.glob)) {
    args.push('--glob', globPattern)
  }

  if (params.pattern.startsWith('-')) {
    args.push('-e', params.pattern)
  } else {
    args.push(params.pattern)
  }

  return args
}

function rgPathToAbsolute(filePath: string, cwd: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(cwd, filePath)
}

function parseRipgrepContent(
  stdout: string,
  cwd: string,
  showLineNumbers: boolean
): { lines: string[]; filenames: string[] } {
  const lines: string[] = []
  const filenames = new Set<string>()
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue
    }

    let event: {
      type?: string
      data?: {
        path?: { text?: string }
        lines?: { text?: string }
        line_number?: number
      }
    }
    try {
      event = JSON.parse(rawLine)
    } catch {
      continue
    }

    if (event.type !== 'match' && event.type !== 'context') {
      continue
    }

    const data = event.data
    const eventPath = data?.path?.text
    const text = data?.lines?.text
    if (!eventPath || text === undefined) {
      continue
    }

    const displayPath = toDisplayPath(rgPathToAbsolute(eventPath, cwd))
    filenames.add(displayPath)
    const split = text.replace(/\r?\n$/, '').split(/\r?\n/)
    const baseLine = data.line_number ?? 0
    for (let index = 0; index < split.length; index++) {
      lines.push(buildLineOutput(displayPath, baseLine + index, split[index], showLineNumbers))
    }
  }
  return { lines, filenames: [...filenames] }
}

async function runRipgrepSearch(
  scope: SearchScope,
  params: GrepInput,
  runRipgrep: RipgrepRunner
): Promise<GrepPayload | { error: string }> {
  const mode = params.output_mode ?? 'files_with_matches'
  const args = [...buildRipgrepArgs(params, mode), scope.target]
  const result = await runRipgrep(args, scope.searchRoot)

  if (result.failedToStart) {
    return { error: 'ripgrep is not available' }
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return { error: result.stderr || `ripgrep failed with exit code ${String(result.exitCode)}` }
  }

  if (mode === 'content') {
    const parsed = parseRipgrepContent(result.stdout, scope.searchRoot, params['-n'] ?? true)
    const limited = applyHeadLimit(parsed.lines, params.head_limit, params.offset ?? 0)

    return {
      mode,
      backend: 'ripgrep',
      num_files: parsed.filenames.length,
      filenames: parsed.filenames,
      content: redactSensitiveText(limited.items.join('\n')),
      num_lines: limited.items.length,
      ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
      ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
    }
  }

  const rawLines = result.stdout.split(/\r?\n/).filter(Boolean)

  if (mode === 'count') {
    const displayLines = rawLines.map((line) => {
      const colonIndex = line.lastIndexOf(':')
      if (colonIndex <= 0) {
        return line
      }
      const filePath = line.slice(0, colonIndex)
      const count = line.slice(colonIndex)
      return `${toDisplayPath(rgPathToAbsolute(filePath, scope.searchRoot))}${count}`
    })
    const limited = applyHeadLimit(displayLines, params.head_limit, params.offset ?? 0)
    let numMatches = 0
    for (const line of limited.items) {
      const count = Number(line.slice(line.lastIndexOf(':') + 1))
      if (Number.isFinite(count)) {
        numMatches += count
      }
    }

    return {
      mode,
      backend: 'ripgrep',
      num_files: limited.items.length,
      filenames: [],
      content: redactSensitiveText(limited.items.join('\n')),
      num_matches: numMatches,
      ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
      ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
    }
  }

  const absoluteMatches = rawLines.map((line) => rgPathToAbsolute(line, scope.searchRoot))
  const stats = await Promise.allSettled(absoluteMatches.map((filePath) => fsp.stat(filePath)))
  const sorted = absoluteMatches
    .map((filePath, index) => {
      const stat = stats[index]
      return [filePath, stat?.status === 'fulfilled' ? stat.value.mtimeMs : 0] as const
    })
    .sort((left, right) => {
      if (process.env.NODE_ENV === 'test') {
        return left[0].localeCompare(right[0])
      }
      const time = right[1] - left[1]
      return time === 0 ? left[0].localeCompare(right[0]) : time
    })
    .map(([filePath]) => filePath)
  const limited = applyHeadLimit(sorted, params.head_limit, params.offset ?? 0)
  const filenames = limited.items.map(toDisplayPath)

  return {
    mode,
    backend: 'ripgrep',
    num_files: filenames.length,
    filenames,
    ...(limited.appliedLimit !== undefined && { applied_limit: limited.appliedLimit }),
    ...(limited.appliedOffset !== undefined && { applied_offset: limited.appliedOffset })
  }
}

export function createGrepTool(options: GrepToolOptions = {}): Tool {
  const platform = options.platform ?? process.platform
  const runRipgrep = options.runRipgrep ?? ((args, cwd) => defaultRunRipgrep(args, cwd, platform))
  const usesDefaultRunner = !options.runRipgrep

  return defineTool({
    name: 'grep',
    label: 'Search',
    description:
      'Search file contents with regular expressions. Prefers ripgrep when available and falls back to a TypeScript scanner. ' +
      'Supports content, files_with_matches, and count output modes, glob/type filtering, case-insensitive search, context lines, limits, offsets, and multiline matching.',
    priority: getToolPriority('grep'),
    idempotent: true,
    faultTolerance: {
      maxRetries: 1,
      timeoutMs: 40_000
    },
    inputSchema: grepInputSchema,
    outputSchema: grepOutputSchema,
    execute: async (_toolCallId, params) => {
      const scope = await resolveSearchScope(params.path)
      if ('error' in scope) {
        return makeResult(scope)
      }

      try {
        compileSearchRegExp(params.pattern, params['-i'] ?? false, true)
      } catch (error) {
        return makeResult({
          error: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
        })
      }

      const rgAvailable = await isRipgrepAvailable(
        runRipgrep,
        scope.searchRoot,
        usesDefaultRunner,
        platform
      )
      if (rgAvailable) {
        const rgPayload = await runRipgrepSearch(scope, params, runRipgrep)
        if (!('error' in rgPayload)) {
          return makeResult(rgPayload)
        }
        if (rgPayload.error !== 'ripgrep is not available') {
          return makeResult(rgPayload)
        }
      }

      try {
        return makeResult(await runTypescriptSearch(scope, params))
      } catch (error) {
        return makeResult({
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  })
}

export type GrepTool = z.infer<ReturnType<typeof grepInputSchema>>
