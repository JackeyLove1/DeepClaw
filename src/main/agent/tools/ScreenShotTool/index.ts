import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeImage, type NativeImage } from 'electron'
import { z } from 'zod'
import { isLinux, isMacOS, isWindows, resolveTmpDir } from '../../utils'
import { ToolExecutionError } from '../fault-tolerance'
import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolErrorCode, ToolErrorType, ToolFailureStage } from '../types'

const screenshotInputSchema = lazySchema(() =>
  z.strictObject({
    task_id: z.string().optional()
  })
)
const screenshotOutputSchema = lazySchema(() => toolExecuteResultSchema)

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const INITIAL_JPEG_QUALITY = 85
const MIN_JPEG_QUALITY = 45
const JPEG_QUALITY_STEP = 10
const MIN_DIMENSION = 480
const RESIZE_FACTOR = 0.85
const CAPTURE_TIMEOUT_MS = 15_000

const toToolError = (
  code: ToolErrorCode,
  type: ToolErrorType,
  stage: ToolFailureStage,
  message: string,
  details?: Record<string, unknown>
): ToolExecutionError =>
  new ToolExecutionError({
    code,
    type,
    stage,
    retryable: false,
    message,
    details
  })

const isPermissionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /permission|denied|screen recording|screen capture|not authorized|forbidden/i.test(message)
}

const escapePowerShellString = (value: string): string => value.replace(/'/g, "''")

const escapeBashString = (value: string): string => value.replace(/'/g, `'\"'\"'`)

type CaptureCommand = {
  shell: 'powershell' | 'bash'
  executable: string
  args: string[]
}

const createCaptureCommand = (
  outputPath: string,
  platform: NodeJS.Platform = process.platform
): CaptureCommand => {
  if (isWindows(platform)) {
    const escapedPath = escapePowerShellString(outputPath)
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
      '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
      '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
      '$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)',
      `$bitmap.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      '$graphics.Dispose()',
      '$bitmap.Dispose()'
    ].join('; ')

    return {
      shell: 'powershell',
      executable: 'powershell',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]
    }
  }

  if (isMacOS(platform)) {
    const escapedPath = escapeBashString(outputPath)
    return {
      shell: 'bash',
      executable: 'bash',
      args: ['-lc', `screencapture -x '${escapedPath}'`]
    }
  }

  if (isLinux(platform)) {
    const escapedPath = escapeBashString(outputPath)
    const command = [
      `if command -v grim >/dev/null 2>&1; then grim '${escapedPath}'`,
      `elif command -v gnome-screenshot >/dev/null 2>&1; then gnome-screenshot -f '${escapedPath}'`,
      `elif command -v scrot >/dev/null 2>&1; then scrot '${escapedPath}'`,
      `elif command -v import >/dev/null 2>&1; then import -window root '${escapedPath}'`,
      "else echo 'No supported screenshot utility found (grim/gnome-screenshot/scrot/import).' >&2; exit 127",
      'fi'
    ].join('; ')
    return {
      shell: 'bash',
      executable: 'bash',
      args: ['-lc', command]
    }
  }

  throw toToolError(
    'TOOL_UNAVAILABLE',
    'tool_unavailable',
    'execution',
    `Unsupported platform "${platform}" for screenshot capture.`
  )
}

const ensureImage = (image: NativeImage): NativeImage => {
  if (image.isEmpty()) {
    throw toToolError(
      'TOOL_UNAVAILABLE',
      'tool_unavailable',
      'execution',
      'Electron returned an empty screenshot thumbnail.'
    )
  }

  const { width, height } = image.getSize()
  if (!width || !height) {
    throw toToolError(
      'TOOL_RESULT_INVALID',
      'result_invalid',
      'result_validation',
      'Electron returned a screenshot with invalid dimensions.'
    )
  }

  return image
}

const encodeScreenshot = (
  image: NativeImage
): { buffer: Buffer; width: number; height: number; quality: number } => {
  let currentImage = image

  while (true) {
    for (
      let quality = INITIAL_JPEG_QUALITY;
      quality >= MIN_JPEG_QUALITY;
      quality -= JPEG_QUALITY_STEP
    ) {
      const buffer = currentImage.toJPEG(quality)
      if (buffer.length <= MAX_SCREENSHOT_BYTES) {
        const { width, height } = currentImage.getSize()
        return { buffer, width, height, quality }
      }
    }

    const { width, height } = currentImage.getSize()
    if (width <= MIN_DIMENSION || height <= MIN_DIMENSION) {
      break
    }

    currentImage = ensureImage(
      currentImage.resize({
        width: Math.max(MIN_DIMENSION, Math.floor(width * RESIZE_FACTOR)),
        height: Math.max(MIN_DIMENSION, Math.floor(height * RESIZE_FACTOR))
      })
    )
  }

  const fallbackBuffer = currentImage.toJPEG(MIN_JPEG_QUALITY)
  if (fallbackBuffer.length > MAX_SCREENSHOT_BYTES) {
    throw toToolError(
      'TOOL_RESULT_INVALID',
      'result_invalid',
      'result_validation',
      'The captured screenshot could not be compressed under the 8 MB limit.'
    )
  }
  const { width, height } = currentImage.getSize()
  return {
    buffer: fallbackBuffer,
    width,
    height,
    quality: MIN_JPEG_QUALITY
  }
}

const runCaptureCommand = async (command: CaptureCommand): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    execFile(
      command.executable,
      command.args,
      {
        timeout: CAPTURE_TIMEOUT_MS,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve()
          return
        }

        const typedError = error as Error & { code?: number | string }
        if (typedError.code === 'ENOENT') {
          reject(
            toToolError(
              'TOOL_UNAVAILABLE',
              'tool_unavailable',
              'execution',
              `Screenshot failed because ${command.shell} is not available on this system.`
            )
          )
          return
        }

        const message = [typedError.message, stderr, stdout]
          .filter((chunk) => typeof chunk === 'string' && chunk.trim().length > 0)
          .join('\n')
        reject(new Error(message || `Screenshot capture command failed with ${command.shell}.`))
      }
    )
  })
}

export function createScreenShotTool(): Tool {
  return defineTool({
    name: 'screenshot',
    label: 'Take Screenshot',
    description:
      'Capture the primary screen, save it to ~/.deepclaw/tmp/<uuid>.jpg, and return it for visual reasoning.',
    idempotent: false,
    faultTolerance: {
      maxRetries: 0,
      timeoutMs: 15_000
    },
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotOutputSchema,
    priority: getToolPriority('screenshot'),
    execute: async () => {
      const screenshotId = randomUUID()
      const tmpDir = resolveTmpDir()
      const tempPngPath = path.join(tmpDir, `${screenshotId}.png`)
      const fileName = `${screenshotId}.jpg`
      const filePath = path.join(tmpDir, fileName)
      const captureCommand = createCaptureCommand(tempPngPath)

      try {
        await mkdir(tmpDir, { recursive: true })
        await runCaptureCommand(captureCommand)

        const image = ensureImage(nativeImage.createFromPath(tempPngPath))
        const { buffer, width, height, quality } = encodeScreenshot(image)

        await writeFile(filePath, buffer)

        const summary =
          `Captured primary screen via ${captureCommand.shell} (${width}x${height}, ${buffer.length} bytes, JPEG quality ${quality}). ` +
          `Saved to ${filePath}`

        return {
          content: [{ type: 'text', text: summary }],
          artifacts: [
            {
              id: screenshotId,
              fileName,
              mimeType: 'image/jpeg',
              filePath,
              sizeBytes: buffer.length,
              width,
              height
            }
          ],
          details: {
            summary,
            filePath,
            sizeBytes: buffer.length,
            width,
            height,
            quality,
            shell: captureCommand.shell
          }
        }
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          throw error
        }

        if (isPermissionError(error)) {
          throw toToolError(
            'TOOL_PERMISSION_DENIED',
            'permission',
            'execution',
            'Screen capture permission was denied. Grant OS screen recording access and retry.'
          )
        }

        const message = error instanceof Error ? error.message : String(error)
        throw toToolError(
          'TOOL_EXECUTION_FAILED',
          'execution',
          'execution',
          `Failed to capture the primary screen: ${message}`
        )
      } finally {
        await unlink(tempPngPath).catch(() => undefined)
      }
    }
  })
}
