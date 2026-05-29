import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import ffmpegStaticPath from 'ffmpeg-static'
import ffprobeStaticInfo from 'ffprobe-static'
import { scanFolder } from './scanner'
import { runStitch, cancelStitch, readStitchedManifest, writeStitchedManifest } from './stitcher'
import { extractThumb } from './thumbs'
import type { StitchJob } from '../shared/types'

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, stream: true, bypassCSP: true } }
])

function getExecutable(rawPath: string): string {
  if (!rawPath) return rawPath
  if (app.isPackaged) {
    return rawPath.replace(
      join('app.asar', 'node_modules'),
      join('app.asar.unpacked', 'node_modules')
    )
  }
  return rawPath
}

function getFfmpeg(): string {
  const p = ffmpegStaticPath
  if (!p) throw new Error('ffmpeg-static binary not found')
  return getExecutable(p)
}

function getFfprobe(): string {
  const p = (ffprobeStaticInfo as { path: string }).path
  if (!p) throw new Error('ffprobe-static binary not found')
  return getExecutable(p)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0B0C10',
    icon: join(__dirname, '../../build/icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Serve local media files via custom protocol (works in both dev and prod)
  protocol.handle('media', (request) => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(filePath).href)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------- Window controls ----------
ipcMain.on('win-minimize', () => mainWindow?.minimize())
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('win-close', () => mainWindow?.close())

// ---------- Folder picker ----------
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('pick-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose output folder'
  })
  return result.canceled ? null : result.filePaths[0]
})

// ---------- Scan ----------
ipcMain.handle('scan', async (event, folder: string, outputDir: string) => {
  const ffprobe = getFfprobe()
  const alreadyStitched = await readStitchedManifest(outputDir || folder)

  return scanFolder(
    folder,
    ffprobe,
    (done, total, current) => {
      event.sender.send('scan-progress', { done, total, current })
    },
    alreadyStitched
  )
})

// ---------- Thumbnail ----------
ipcMain.handle('thumb-at', async (_event, clipPath: string, seconds: number): Promise<string> => {
  try {
    const outPath = await extractThumb(getFfmpeg(), clipPath, seconds)
    return pathToFileURL(outPath).href
  } catch {
    return ''
  }
})

// ---------- Stitch ----------
ipcMain.handle(
  'stitch',
  async (event, jobs: StitchJob[], outDir: string) => {
    const ffmpeg = getFfmpeg()

    for (const job of jobs) {
      try {
        // Calculate total duration for progress
        const totalDur = job.segmentPaths.length * 600  // rough estimate; real duration from recorder

        await runStitch(job, outDir, ffmpeg, totalDur, (pct) => {
          event.sender.send('stitch-progress', {
            id: job.fileNumber,
            pct,
            done: pct >= 100
          })
        })

        event.sender.send('stitch-progress', {
          id: job.fileNumber,
          pct: 100,
          done: true
        })
      } catch (err) {
        event.sender.send('stitch-progress', {
          id: job.fileNumber,
          pct: 0,
          done: true,
          error: (err as Error).message
        })
      }
    }

    // Persist manifest
    await writeStitchedManifest(outDir, jobs.map(j => j.fileNumber))
  }
)

ipcMain.on('cancel-stitch', () => cancelStitch())

// ---------- Open folder ----------
ipcMain.handle('open-folder', async (_event, folderPath: string) => {
  await shell.openPath(folderPath)
})
