import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { spawn } from 'child_process'

const THUMB_DIR = path.join(os.tmpdir(), 'gopro-stitcher-thumbs')
let thumbDirReady = false

async function ensureThumbDir(): Promise<void> {
  if (thumbDirReady) return
  try { await fs.mkdir(THUMB_DIR, { recursive: true }) } catch { /**/ }
  thumbDirReady = true
}

function thumbKey(clipPath: string, seconds: number): string {
  const hash = crypto.createHash('md5').update(`${clipPath}:${seconds.toFixed(3)}`).digest('hex')
  return hash
}

export async function extractThumb(
  ffmpegPath: string,
  clipPath: string,
  seconds: number
): Promise<string> {
  await ensureThumbDir()

  const key = thumbKey(clipPath, seconds)
  const outPath = path.join(THUMB_DIR, `${key}.jpg`)

  // Return cached thumb if it exists
  try {
    await fs.access(outPath)
    return outPath
  } catch { /**/ }

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y',
      '-ss', seconds.toFixed(3),
      '-i', clipPath,
      '-frames:v', '1',
      '-q:v', '4',
      '-vf', 'scale=320:-2',
      outPath
    ]
    const proc = spawn(ffmpegPath, args)
    proc.stderr.on('data', () => {})
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg thumb exited ${code}`))
      else resolve()
    })
  })

  return outPath
}
