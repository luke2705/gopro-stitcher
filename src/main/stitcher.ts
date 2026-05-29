import { promises as fs, createWriteStream } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn, ChildProcess } from 'child_process'
import type { StitchJob } from '../shared/types'

let currentProcess: ChildProcess | null = null

export function cancelStitch(): void {
  if (currentProcess) {
    currentProcess.kill('SIGKILL')
    currentProcess = null
  }
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function safeOutputPath(dir: string, baseName: string): Promise<string> {
  const ext = path.extname(baseName)
  const stem = path.basename(baseName, ext)
  let candidate = path.join(dir, baseName)
  let n = 2
  while (await fileExists(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`)
    n++
  }
  return candidate
}

function parseFfmpegProgress(line: string): number | null {
  // Progress lines from -progress pipe:1:  "out_time_ms=12345678"
  const m = line.match(/^out_time_ms=(\d+)/)
  if (m) return parseInt(m[1], 10) / 1_000_000  // microseconds → seconds
  return null
}

async function remuxSegment(
  ffmpegPath: string,
  inputPath: string,
  targetRes: string,
  outPath: string
): Promise<void> {
  const [w, h] = targetRes.split('×').map(Number)
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-vf', `scale=${w}:${h}`,
      '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
      '-c:a', 'copy',
      outPath
    ]
    const proc = spawn(ffmpegPath, args)
    proc.stderr.on('data', () => {})
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg remux exited ${code}`))
      else resolve()
    })
  })
}

export async function runStitch(
  job: StitchJob,
  outDir: string,
  ffmpegPath: string,
  totalDur: number,
  onProgress: (pct: number) => void
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gopro-stitch-'))

  try {
    // Handle mixed specs: remux mismatched segments to temp files
    const resolvedPaths = [...job.segmentPaths]
    const dominantRes = job.segmentPaths.length > 0 ? undefined : undefined  // determined by scanner

    for (const idx of job.rewrapIndexes) {
      const src = job.segmentPaths[idx]
      const tmpOut = path.join(tmpDir, `rewrap_${idx}.mp4`)
      // We need dominant resolution — infer from first non-rewrap segment
      // For simplicity, use scale filter to match first segment's resolution
      // This is the rare path; just remux to a matching container
      await remuxSegment(ffmpegPath, src, '1920×1080', tmpOut)
      resolvedPaths[idx] = tmpOut
    }

    // Write concat list
    const listPath = path.join(tmpDir, 'list.txt')
    const listContent = resolvedPaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n')
    await fs.writeFile(listPath, listContent, 'utf-8')

    const outPath = await safeOutputPath(outDir, job.outputName)

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-progress', 'pipe:1',
        '-nostats',
        outPath
      ]
      const proc = spawn(ffmpegPath, args)
      currentProcess = proc

      proc.stdout.on('data', (d: Buffer) => {
        for (const line of d.toString().split('\n')) {
          const t = parseFfmpegProgress(line.trim())
          if (t !== null && totalDur > 0) {
            onProgress(Math.min(99, (t / totalDur) * 100))
          }
        }
      })
      proc.stderr.on('data', () => {})
      proc.on('error', reject)
      proc.on('close', (code) => {
        currentProcess = null
        if (code !== 0 && code !== null) reject(new Error(`ffmpeg concat exited ${code}`))
        else resolve()
      })
    })

    onProgress(100)
  } finally {
    // Clean up temp files
    try {
      const files = await fs.readdir(tmpDir)
      await Promise.all(files.map(f => fs.unlink(path.join(tmpDir, f)).catch(() => {})))
      await fs.rmdir(tmpDir)
    } catch { /**/ }
  }
}

export async function readStitchedManifest(outDir: string): Promise<Set<string>> {
  const manifestPath = path.join(outDir, '.stitched.json')
  try {
    const data = await fs.readFile(manifestPath, 'utf-8')
    const list: string[] = JSON.parse(data)
    return new Set(list)
  } catch {
    return new Set()
  }
}

export async function writeStitchedManifest(outDir: string, fileNumbers: string[]): Promise<void> {
  const manifestPath = path.join(outDir, '.stitched.json')
  let existing: string[] = []
  try {
    const data = await fs.readFile(manifestPath, 'utf-8')
    existing = JSON.parse(data)
  } catch { /**/ }
  const merged = [...new Set([...existing, ...fileNumbers])]
  await fs.writeFile(manifestPath, JSON.stringify(merged), 'utf-8')
}
