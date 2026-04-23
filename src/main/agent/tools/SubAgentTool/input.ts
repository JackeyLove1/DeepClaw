import { z } from 'zod'

import { lazySchema } from '../schema'

export const subAgentInputSchema = lazySchema(() =>
  z.strictObject({
    task: z.string().describe('The task or question for the sub-agent to work on.'),
    allowed_tools: z
      .array(z.string())
      .optional()
      .describe(
        'Optional whitelist of tool names the sub-agent can use. ' +
          'Defaults to read-only tools (get_time, read_file, grep). ' +
          'The sub_agent tool is always excluded to prevent recursion.'
      ),
    max_tokens: z
      .number()
      .int()
      .min(256)
      .max(16384)
      .optional()
      .describe('Maximum output tokens for the sub-agent response. Defaults to 4096.')
  })
)
