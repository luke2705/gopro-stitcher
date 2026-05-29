import React from 'react'
import Icon from './Icon'

interface AppBarProps {
  folder?: string | null
  onReopen?: () => void
}

function folderShort(folder: string): string {
  const parts = folder.replace(/\\/g, '/').split('/')
  const last2 = parts.slice(-2).join('\\')
  return last2 || folder
}

export default function AppBar({ folder, onReopen }: AppBarProps): React.ReactElement {
  return (
    <header className="appbar">
      <div className="mark">
        <div className="glyph"><Icon name="cut" size={18} /></div>
        <div className="title">
          GoPro Stitcher
          <span className="sub">lossless segment joiner</span>
        </div>
      </div>
      <div className="spacer" />
      {folder && (
        <div className="src no-drag" onClick={onReopen} title="Open another folder">
          <Icon name="folder" size={15} />
          {folderShort(folder)}
          <span className="chg">Change</span>
        </div>
      )}
      <div className="win-controls no-drag">
        <button
          className="win-btn"
          onClick={() => window.stitcher.winMinimize()}
          title="Minimize"
        >
          <Icon name="minimize" size={16} />
        </button>
        <button
          className="win-btn"
          onClick={() => window.stitcher.winMaximize()}
          title="Maximize"
        >
          <Icon name="maximize" size={16} />
        </button>
        <button
          className="win-btn close"
          onClick={() => window.stitcher.winClose()}
          title="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  )
}
