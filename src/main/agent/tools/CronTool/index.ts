import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolExecuteResult } from '../types'
import { getCronService } from '../../cron'
import { cronToolInputSchema } from './input'

const cronInputSchema = lazySchema(() => cronToolInputSchema())
const cronOutputSchema = lazySchema(() => toolExecuteResultSchema)

export function createCronTool(): Tool {
  return defineTool({
    name: 'cronjob',
    label: 'Cron Jobs',
    description:
      'Create and manage scheduled cron jobs. Actions: create, list, update, pause, resume, run, remove.',
    inputSchema: cronInputSchema,
    outputSchema: cronOutputSchema,
    priority: getToolPriority('cronjob'),
    execute: async (_toolCallId, params): Promise<ToolExecuteResult> => {
      const service = getCronService()

      if (params.action === 'list') {
        const jobs = await service.listJobs()
        const text = JSON.stringify({ jobs }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `cron jobs: ${jobs.length}` }
        }
      }

      if (params.action === 'create') {
        const job = await service.createJob({
          name: params.name!,
          prompt: params.prompt!,
          schedule: params.schedule!,
          timezone: params.timezone,
          deliver: params.deliver,
          skills: params.skills,
          script: params.script,
          maxRuns: params.max_runs,
          sourceSessionId: params.source_session_id ?? params.task_id ?? null
        })
        const text = JSON.stringify({ job }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `created cron job ${job.name}` }
        }
      }

      if (params.action === 'update') {
        const job = await service.updateJob(params.job_id!, {
          name: params.name,
          prompt: params.prompt,
          schedule: params.schedule,
          timezone: params.timezone,
          deliver: params.deliver,
          skills: params.skills,
          script: params.script,
          maxRuns: params.max_runs
        })
        const text = JSON.stringify({ job }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `updated cron job ${job.name}` }
        }
      }

      if (params.action === 'pause') {
        const job = await service.pauseJob(params.job_id!)
        const text = JSON.stringify({ job }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `paused cron job ${job.name}` }
        }
      }

      if (params.action === 'resume') {
        const job = await service.resumeJob(params.job_id!)
        const text = JSON.stringify({ job }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `resumed cron job ${job.name}` }
        }
      }

      if (params.action === 'run') {
        const run = await service.runJob(params.job_id!)
        const text = JSON.stringify({ run }, null, 2)
        return {
          content: [{ type: 'text', text }],
          details: { summary: `ran cron job ${params.job_id}` }
        }
      }

      await service.removeJob(params.job_id!)
      return {
        content: [{ type: 'text', text: JSON.stringify({ removed: params.job_id }, null, 2) }],
        details: { summary: `removed cron job ${params.job_id}` }
      }
    }
  })
}
