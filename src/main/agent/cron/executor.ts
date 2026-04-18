import { randomUUID } from 'node:crypto'
import { AnthropicChatRuntime } from '../agent-loop'
import { ChatSessionStore } from '../../chat/session-store'
import { resolveRuntimeConfig } from '../config'
import { clampText } from '../text-utils'
import { loadInstalledSkillsFromDir, type InstalledSkill } from '../skills/loadSkillsDir'
import { createTools } from '../tools'
import type { CronJob, ExecuteCronJobResult } from './types'

class CronUsageStore extends ChatSessionStore {
  override async appendUsageRecord(): Promise<void> {
    return
  }

  override appendToolUsageRecord(): void {
    return
  }

  override appendSkillUsageRecord(): void {
    return
  }
}

const formatSelectedSkills = (selectedSkills: InstalledSkill[]): string => {
  if (selectedSkills.length === 0) {
    return ''
  }

  return selectedSkills
    .map((skill) => `## Skill: ${skill.skillId}\n\n${skill.body.trim()}`)
    .join('\n\n')
}

const buildCronPrompt = (job: CronJob, selectedSkills: InstalledSkill[]): string => {
  const sections = ['You are running as a scheduled cron job. Do not ask clarifying questions.']

  const skillText = formatSelectedSkills(selectedSkills)
  if (skillText) {
    sections.push(`Attached skill context:\n\n${skillText}`)
  }

  sections.push(`Task:\n${job.prompt.trim()}`)
  return sections.join('\n\n')
}

export class CronExecutor {
  async execute(job: CronJob): Promise<ExecuteCronJobResult> {
    const installedSkills = loadInstalledSkillsFromDir()
    const selectedSkills = installedSkills.filter((skill) => job.skills.includes(skill.skillId))
    const prompt = buildCronPrompt(job, selectedSkills)
    const runtime = new AnthropicChatRuntime({
      usageStore: new CronUsageStore(),
      installedSkills,
      toolsFactory: () => createTools({ includeCronTool: false })
    })

    let outputText = ''
    let inputTokens = 0
    let outputTokens = 0
    let cacheCreationTokens = 0
    let cacheReadTokens = 0

    for await (const event of runtime.runTurn({
      sessionId: `cron_${randomUUID()}`,
      userText: prompt,
      history: []
    })) {
      if (event.type === 'assistant.completed') {
        outputText = event.text
        for (const usage of event.apiUsages ?? []) {
          inputTokens += usage.inputTokens
          outputTokens += usage.outputTokens
          cacheCreationTokens += usage.cacheCreationTokens
          cacheReadTokens += usage.cacheReadTokens
        }
      }
    }

    return {
      outputText: outputText.trim(),
      status: 'success',
      model: resolveRuntimeConfig().model,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      errorText: null
    }
  }

  toPreview(text: string): string {
    return clampText(text, 240)
  }
}
