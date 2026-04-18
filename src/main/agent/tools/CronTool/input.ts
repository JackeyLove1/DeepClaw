import { z } from 'zod'

export const cronToolInputSchema = () =>
  z
    .strictObject({
      action: z.enum(['create', 'list', 'update', 'pause', 'resume', 'run', 'remove']),
      job_id: z.string().trim().optional(),
      name: z.string().trim().optional(),
      prompt: z.string().trim().optional(),
      schedule: z.string().trim().optional(),
      timezone: z.string().trim().nullable().optional(),
      deliver: z.enum(['origin_session', 'local_file']).optional(),
      skills: z.array(z.string().trim()).optional(),
      script: z.string().trim().nullable().optional(),
      max_runs: z.number().int().positive().nullable().optional(),
      source_session_id: z.string().trim().nullable().optional(),
      task_id: z.string().trim().optional()
    })
    .superRefine((value, ctx) => {
      const actionsRequiringJobId = new Set(['update', 'pause', 'resume', 'run', 'remove'])
      if (actionsRequiringJobId.has(value.action) && !value.job_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['job_id'],
          message: 'job_id is required for this action.'
        })
      }

      if (value.action === 'create') {
        if (!value.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['name'],
            message: 'name is required when creating a cron job.'
          })
        }

        if (!value.prompt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['prompt'],
            message: 'prompt is required when creating a cron job.'
          })
        }

        if (!value.schedule) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule'],
            message: 'schedule is required when creating a cron job.'
          })
        }
      }
    })
