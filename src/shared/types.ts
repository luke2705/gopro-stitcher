export interface Segment {
  name: string
  path: string
  chapter: number
  dur: number       // seconds (float)
  res: string       // e.g. "3840x2160"
  fps: number
  sizeBytes: number
  start: number     // offset from recording start in seconds
}

export interface Recording {
  fileNumber: string
  label?: string
  recorded?: string  // human-readable date
  res: string        // dominant resolution
  fps: number
  codec: string      // "HEVC", "AVC", etc.
  mixedSpecs: boolean
  single: boolean
  alreadyStitched: boolean
  selected: boolean
  segments: Segment[]
}

export interface ScanResult {
  recordings: Recording[]
  ignored: string[]
  folder: string
}

export interface ScanProgress {
  done: number
  total: number
  current?: string
}

export interface StitchJob {
  fileNumber: string
  segmentPaths: string[]
  rewrapIndexes: number[]
  outputName: string
}

export interface StitchProgress {
  id: string       // fileNumber
  pct: number      // 0–100
  done: boolean
  error?: string
}
