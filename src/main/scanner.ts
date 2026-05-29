import { promises as fs } from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import type { Recording, Segment, ScanResult } from '../shared/types'

// GoPro filename patterns
const GOPRO_MODERN = /^(GX|GH)(\d{2})(\d{4})\.MP4$/i   // HEVC/AVC: prefix + 2-digit chapter + 4-digit file
const LEGACY_FIRST = /^GOPR(\d{4})\.MP4$/i               // legacy chapter 0
const LEGACY_NEXT  = /^GP(\d{2})(\d{4})\.MP4$/i          // legacy chapters 1+

interface ParsedFile {
  fileNumber: string
  chapter: number
  name: string
  fullPath: string
}

function parseGoPro(name: string, fullPath: string): ParsedFile | null {
  let m: RegExpExecArray | null
  if ((m = GOPRO_MODERN.exec(name)))  return { fileNumber: m[3], chapter: parseInt(m[2], 10), name, fullPath }
  if ((m = LEGACY_FIRST.exec(name)))  return { fileNumber: m[1], chapter: 0, name, fullPath }
  if ((m = LEGACY_NEXT.exec(name)))   return { fileNumber: m[2], chapter: parseInt(m[1], 10), name, fullPath }
  return null
}

interface FfprobeResult {
  dur: number
  width: number
  height: number
  fps: number
  codec: string
  sizeBytes: number
  recorded?: string
}

function runFfprobe(ffprobePath: string, filePath: string): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]
    let output = ''
    const proc = spawn(ffprobePath, args)
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', () => {})
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code} for ${filePath}`))
      try {
        const json = JSON.parse(output)
        const videoStream = (json.streams || []).find(
          (s: { codec_type: string }) => s.codec_type === 'video'
        )
        if (!videoStream) return reject(new Error('No video stream found'))

        const dur = parseFloat(json.format?.duration || '0')
        const width: number = videoStream.width || 0
        const height: number = videoStream.height || 0
        const sizeBytes: number = parseInt(json.format?.size || '0', 10)
        const codecRaw: string = (videoStream.codec_name || '').toLowerCase()
        const codec = codecRaw === 'hevc' ? 'HEVC' : codecRaw === 'h264' ? 'AVC' : codecRaw.toUpperCase()

        // fps: r_frame_rate is "num/den" e.g. "60000/1001"
        const [num, den] = (videoStream.r_frame_rate || '30/1').split('/').map(Number)
        const fps = Math.round((num / (den || 1)) * 10) / 10

        // recorded date from tags
        const tags = json.format?.tags || {}
        const recorded = tags.creation_time
          ? new Date(tags.creation_time).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit', hour12: true
            })
          : undefined

        resolve({ dur, width, height, fps, codec, sizeBytes, recorded })
      } catch (e) {
        reject(e)
      }
    })
  })
}

function resLabel(width: number, height: number): string {
  if (width >= 3840) return `${width}×${height}`
  if (width >= 2704) return `${width}×${height}`
  if (width >= 1920) return `${width}×${height}`
  return `${width}×${height}`
}

export async function scanFolder(
  folder: string,
  ffprobePath: string,
  onProgress: (done: number, total: number, current?: string) => void,
  alreadyStitchedSet: Set<string>
): Promise<ScanResult> {
  const entries = await fs.readdir(folder)
  const mp4s = entries.filter(e => /\.mp4$/i.test(e))

  const parsed: ParsedFile[] = []
  const ignored: string[] = []

  for (const name of mp4s) {
    const p = parseGoPro(name, path.join(folder, name))
    if (p) {
      parsed.push(p)
    } else {
      ignored.push(name)
    }
  }

  // also collect non-MP4 unrecognized files as ignored
  for (const name of entries) {
    if (!/\.mp4$/i.test(name) && !/^\./.test(name)) {
      ignored.push(name)
    }
  }

  // group by file number
  const groups = new Map<string, ParsedFile[]>()
  for (const p of parsed) {
    const g = groups.get(p.fileNumber) || []
    g.push(p)
    groups.set(p.fileNumber, g)
  }

  // sort each group by chapter
  for (const g of groups.values()) {
    g.sort((a, b) => a.chapter - b.chapter)
  }

  const total = parsed.length
  let done = 0

  const recordings: Recording[] = []

  for (const [fileNumber, files] of groups) {
    const segments: Segment[] = []
    let start = 0

    for (const f of files) {
      onProgress(done, total, f.name)
      let probe: FfprobeResult
      try {
        probe = await runFfprobe(ffprobePath, f.fullPath)
      } catch {
        // skip unreadable files
        done++
        continue
      }
      segments.push({
        name: f.name,
        path: f.fullPath,
        chapter: f.chapter,
        dur: probe.dur,
        res: resLabel(probe.width, probe.height),
        fps: probe.fps,
        sizeBytes: probe.sizeBytes,
        start
      })
      start += probe.dur
      done++
      onProgress(done, total, f.name)
    }

    if (segments.length === 0) continue

    const first = segments[0]
    const dominantRes = first.res
    const mixedSpecs = segments.some(s => s.res !== dominantRes || Math.abs(s.fps - first.fps) > 1)

    // get recording metadata from first segment's ffprobe
    let probe: FfprobeResult | null = null
    try { probe = await runFfprobe(ffprobePath, first.path) } catch { /**/ }

    recordings.push({
      fileNumber,
      label: `Recording ${fileNumber}`,
      recorded: probe?.recorded,
      res: dominantRes,
      fps: first.fps,
      codec: probe?.codec || first.res,
      mixedSpecs,
      single: segments.length === 1,
      alreadyStitched: alreadyStitchedSet.has(fileNumber),
      selected: segments.length > 1 && !alreadyStitchedSet.has(fileNumber),
      segments
    })
  }

  // sort recordings by file number ascending
  recordings.sort((a, b) => a.fileNumber.localeCompare(b.fileNumber))

  return { recordings, ignored, folder }
}
