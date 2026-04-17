import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  findInstalledSkillByFilePath,
  loadInstalledSkillsFromDir,
  seedBundledSkillsIntoUserDir
} from './loadSkillsDir'

const tempDirs: string[] = []

const createTempDir = (): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notemark-skills-'))
  tempDirs.push(tempDir)
  return tempDir
}

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

describe('skills loader', () => {
  it('seeds bundled skills into the user directory without overwriting existing files', () => {
    const bundledDir = createTempDir()
    const userDir = createTempDir()

    writeFile(
      path.join(bundledDir, 'powerpoint', 'SKILL.md'),
      '---\nname: powerpoint\ndescription: Slide workflows\n---\n# Powerpoint'
    )
    writeFile(path.join(bundledDir, 'powerpoint', 'guide.md'), 'bundled guide')
    writeFile(
      path.join(bundledDir, 'productivity', 'powerpoint', 'SKILL.md'),
      '---\nname: powerpoint\ndescription: Nested slide workflows\n---\n# Nested Powerpoint'
    )

    writeFile(
      path.join(userDir, 'powerpoint', 'SKILL.md'),
      '---\nname: powerpoint\ndescription: User custom skill\n---\n# Custom'
    )

    const result = seedBundledSkillsIntoUserDir({
      bundledSkillsDir: bundledDir,
      userSkillsDir: userDir
    })

    expect(result.sourceDir).toBe(bundledDir)
    expect(fs.readFileSync(path.join(userDir, 'powerpoint', 'SKILL.md'), 'utf8')).toContain(
      'User custom skill'
    )
    expect(fs.existsSync(path.join(userDir, 'powerpoint', 'guide.md'))).toBe(true)
    expect(fs.existsSync(path.join(userDir, 'productivity', 'powerpoint', 'SKILL.md'))).toBe(true)
    expect(result.copiedFiles).toBe(2)
    expect(result.skippedFiles).toBe(1)
  })

  it('loads recursive skills, keeps relative-path ids, and skips malformed frontmatter', () => {
    const userDir = createTempDir()

    writeFile(
      path.join(userDir, 'powerpoint', 'SKILL.md'),
      '---\nname: powerpoint\ndescription: Slide workflows\ntags: [slides, docs]\n---\n# Powerpoint'
    )
    writeFile(
      path.join(userDir, 'productivity', 'powerpoint', 'SKILL.md'),
      '---\nname: powerpoint\ndescription: Nested slide workflows\n---\n# Nested'
    )
    writeFile(path.join(userDir, 'broken', 'SKILL.md'), '# missing frontmatter')

    const skills = loadInstalledSkillsFromDir(userDir)

    expect(skills.map((skill) => skill.skillId)).toEqual([
      'powerpoint',
      'productivity/powerpoint'
    ])
    expect(skills[0]?.name).toBe('powerpoint')
    expect(skills[0]?.description).toBe('Slide workflows')
    expect(skills[0]?.tags).toEqual(['slides', 'docs'])
  })

  it('finds a loaded skill by its resolved SKILL.md path', () => {
    const userDir = createTempDir()
    const skillFilePath = path.join(userDir, 'linear', 'SKILL.md')

    writeFile(
      skillFilePath,
      '---\nname: linear\ndescription: Manage Linear issues\n---\n# Linear'
    )

    const skills = loadInstalledSkillsFromDir(userDir)
    const match = findInstalledSkillByFilePath(skillFilePath, skills)

    expect(match?.skillId).toBe('linear')
    expect(match?.skillFilePath).toBe(path.resolve(skillFilePath))
  })
})
