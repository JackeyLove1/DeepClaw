import { z } from 'zod'

import { lazySchema } from '../schema'

const optionalInt = (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === null || value === '') {
        return undefined
      }
      return value
    }, z.coerce.number().optional())
    .transform((value) => (value === undefined ? undefined : Math.floor(value)))
    .pipe(z.number().int().min(min).max(max).optional())

const optionalBoolean = () =>
  z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value
    }

    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false
    }
    return value
  }, z.boolean().optional())

export const grepOutputModeSchema = z.enum(['content', 'files_with_matches', 'count'])

export const grepInputSchema = lazySchema(() =>
  z.strictObject({
    pattern: z.string().min(1).describe('The regular expression pattern to search for.'),
    path: z
      .string()
      .optional()
      .describe('File or directory to search in. Defaults to the agent working directory.'),
    glob: z
      .string()
      .optional()
      .describe('Glob pattern filter, for example "*.js" or "*.{ts,tsx}".'),
    output_mode: grepOutputModeSchema
      .optional()
      .describe('Output mode. Defaults to files_with_matches.'),
    '-B': optionalInt().describe('Number of lines before each match in content mode.'),
    '-A': optionalInt().describe('Number of lines after each match in content mode.'),
    '-C': optionalInt().describe('Alias for context lines in content mode.'),
    context: optionalInt().describe('Number of lines before and after each match in content mode.'),
    '-n': optionalBoolean().describe('Show line numbers in content mode. Defaults to true.'),
    '-i': optionalBoolean().describe('Case-insensitive search.'),
    type: z.string().optional().describe('File type filter, for example ts, js, md, py.'),
    head_limit: optionalInt().describe('Limit output entries. Defaults to 250; 0 means unlimited.'),
    offset: optionalInt().describe('Skip this many output entries before applying head_limit.'),
    multiline: optionalBoolean().describe('Allow matches to span lines.')
  })
)

export type GrepInput = z.infer<ReturnType<typeof grepInputSchema>>
