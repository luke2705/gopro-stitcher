import React, { useEffect, useState } from 'react'
import type { Recording } from '../types'
import { fmtClock, recordingTotal, mediaUrl } from '../utils'
import Icon from './Icon'

interface RecordingListProps {
  recordings: Recording[]
  ignored: string[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
}

function PosterThumb({ rec }: { rec: Recording }): React.ReactElement {
  const [src, setSrc] = useState<string>('')

  useEffect(() => {
    const seg = rec.segments[0]
    if (!seg) return
    const mid = seg.dur / 3
    window.stitcher.thumbAt(seg.path, mid).then(url => {
      if (url) setSrc(url)
    }).catch(() => {})
  }, [rec.fileNumber, rec.segments[0]?.path])

  if (src) {
    return <img className="thumb" src={src} alt="" />
  }
  return <div className="thumb" style={{ background: 'var(--fill)' }} />
}

export default function RecordingList({
  recordings,
  ignored,
  selectedId,
  onSelect,
  onToggle,
  onSelectAll
}: RecordingListProps): React.ReactElement {
  return (
    <aside className="events">
      <div className="events-head">
        <span className="h">Recordings · {recordings.length}</span>
        <span className="link" onClick={onSelectAll}>Select all</span>
      </div>

      <div className="events-list">
        {recordings.map(rec => (
          <RecordingCard
            key={rec.fileNumber}
            rec={rec}
            active={rec.fileNumber === selectedId}
            onSelect={() => onSelect(rec.fileNumber)}
            onToggle={() => onToggle(rec.fileNumber)}
          />
        ))}
      </div>

      {ignored.length > 0 && (
        <div className="events-foot">
          <div className="ignored">
            <Icon name="warning" size={13} style={{ opacity: 0.5 }} />
            {ignored.length} non-GoPro file{ignored.length !== 1 ? 's' : ''} ignored
          </div>
        </div>
      )}
    </aside>
  )
}

function RecordingCard({
  rec,
  active,
  onSelect,
  onToggle
}: {
  rec: Recording
  active: boolean
  onSelect: () => void
  onToggle: () => void
}): React.ReactElement {
  const dur = fmtClock(recordingTotal(rec))
  const dim = rec.single && !rec.selected

  return (
    <div
      className={`ev-card${active ? ' sel' : ''}${dim ? ' dim' : ''}`}
      onClick={onSelect}
    >
      <input
        type="checkbox"
        className="chk"
        checked={rec.selected}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
      />
      <div style={{ overflow: 'hidden', borderRadius: 7 }}>
        <PosterThumb rec={rec} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="nm">
          <span className="mono">…{rec.fileNumber}</span>
        </div>
        <div className="meta">
          {rec.single
            ? <span className="chip mute" style={{ height: 17, fontSize: 9.5 }}>single clip</span>
            : <span>{rec.segments.length} seg · {dur}</span>
          }
          {rec.mixedSpecs && <span className="chip warn" style={{ height: 17, fontSize: 9.5 }}>mixed</span>}
          {rec.alreadyStitched && <span className="chip ok" style={{ height: 17, fontSize: 9.5 }}>stitched</span>}
        </div>
      </div>
    </div>
  )
}
