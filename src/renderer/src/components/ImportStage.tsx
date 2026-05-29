import React, { useState } from 'react'
import Icon from './Icon'

interface ImportStageProps {
  scanning: boolean
  scanProgress: { done: number; total: number; current?: string }
  folder?: string
  onPickFolder: () => void
  onDropFolder: (folder: string) => void
}

export default function ImportStage({
  scanning,
  scanProgress,
  folder,
  onPickFolder,
  onDropFolder
}: ImportStageProps): React.ReactElement {
  const [over, setOver] = useState(false)

  const pct = scanProgress.total > 0
    ? Math.min(100, (scanProgress.done / scanProgress.total) * 100)
    : 0

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setOver(true)
  }

  function handleDragLeave() {
    setOver(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setOver(false)
    const item = e.dataTransfer.items[0]
    if (item?.kind === 'file') {
      const file = item.getAsFile()
      // In Electron, DataTransferItem can have a path
      const anyItem = item as unknown as { getAsFileSystemHandle?: () => unknown }
      // Use webkitGetAsEntry for directory drops
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        // @ts-expect-error – Electron exposes .path on File
        const dirPath = (file as unknown as { path: string }).path || ''
        if (dirPath) onDropFolder(dirPath)
      }
    }
  }

  return (
    <div className="import-stage">
      {!scanning ? (
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="ic"><Icon name="folderOpen" size={40} /></div>
          <h1>Drop a folder of GoPro clips</h1>
          <p>
            We group chaptered segments automatically by recording — same file number, ordered by
            chapter. Nothing leaves your machine.
          </p>
          <span className="or">or</span>
          <button className="btn primary lg" onClick={onPickFolder}>
            <Icon name="folder" size={18} /> Choose folder…
          </button>
          <span className="hint">Looks for GX·· / GH·· / GOPR / GP·· files · MP4</span>
        </div>
      ) : (
        <div className="dropzone" style={{ cursor: 'default' }}>
          <div className="ic"><Icon name="scan" size={40} /></div>
          <h1>Scanning…</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {scanProgress.current || folder || ''}
          </p>
          <div className="progress-bar" style={{ marginTop: 4 }}>
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="hint">
            {scanProgress.done} of {scanProgress.total || '…'} clips scanned
          </span>
        </div>
      )}
    </div>
  )
}
