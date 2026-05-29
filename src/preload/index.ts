import { contextBridge, ipcRenderer } from 'electron'
import type { ScanResult, ScanProgress, StitchJob, StitchProgress } from '../shared/types'

export interface StitcherAPI {
  pickFolder(): Promise<string | null>
  pickOutputDir(): Promise<string | null>
  scan(folder: string, outputDir: string): Promise<ScanResult>
  onScanProgress(cb: (p: ScanProgress) => void): () => void
  thumbAt(clipPath: string, seconds: number): Promise<string>
  stitch(jobs: StitchJob[], outDir: string): Promise<void>
  onStitchProgress(cb: (p: StitchProgress) => void): () => void
  cancelStitch(): void
  openFolder(path: string): Promise<void>
  // Window controls
  winMinimize(): void
  winMaximize(): void
  winClose(): void
  // Media URL helper (converts local path to streamable media:// URL)
  mediaUrl(filePath: string): string
}

const api: StitcherAPI = {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickOutputDir: () => ipcRenderer.invoke('pick-output-dir'),
  scan: (folder, outputDir) => ipcRenderer.invoke('scan', folder, outputDir),

  onScanProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, p: ScanProgress) => cb(p)
    ipcRenderer.on('scan-progress', handler)
    return () => ipcRenderer.removeListener('scan-progress', handler)
  },

  thumbAt: (clipPath, seconds) => ipcRenderer.invoke('thumb-at', clipPath, seconds),

  stitch: (jobs, outDir) => ipcRenderer.invoke('stitch', jobs, outDir),

  onStitchProgress: (cb) => {
    const handler = (_: Electron.IpcRendererEvent, p: StitchProgress) => cb(p)
    ipcRenderer.on('stitch-progress', handler)
    return () => ipcRenderer.removeListener('stitch-progress', handler)
  },

  cancelStitch: () => ipcRenderer.send('cancel-stitch'),

  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose: () => ipcRenderer.send('win-close'),

  mediaUrl: (filePath: string) => {
    if (!filePath) return ''
    return `media://local?path=${encodeURIComponent(filePath)}`
  }
}

contextBridge.exposeInMainWorld('stitcher', api)
