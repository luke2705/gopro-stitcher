import type { Recording, Segment } from './types'

export function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function recordingTotal(rec: Recording): number {
  return rec.segments.reduce((a, s) => a + s.dur, 0)
}

export function recordingSizeGB(rec: Recording): number {
  return rec.segments.reduce((a, s) => a + s.sizeBytes, 0) / 1_073_741_824
}

export function outName(fileNumber: string, label: string, recorded: string | undefined, pattern: string): string {
  const date = recorded
    ? recorded.replace(/[^0-9]/g, '').slice(0, 8)
    : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeName = label.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()
  return (
    pattern
      .replace('{file}', fileNumber)
      .replace('{date}', date)
      .replace('{label}', safeName)
    + '.mp4'
  )
}

// Convert a local filesystem path to our media:// URL for the Electron protocol handler
declare global {
  interface Window {
    stitcher: import('./types').StitcherAPI
  }
}

export function mediaUrl(filePath: string): string {
  return window.stitcher.mediaUrl(filePath)
}
