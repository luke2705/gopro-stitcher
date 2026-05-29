import React, { useState } from 'react'
import type { Recording } from '../types'
import { fmtClock, fmtDur, recordingTotal, mediaUrl } from '../utils'
import Icon from './Icon'
import TransitionPreview from './TransitionPreview'

interface RecordingDetailProps {
  recording: Recording
  confirmed: Record<number, boolean>
  onConfirm: (cutIndex: number, value: boolean) => void
  onReorder: (from: number, to: number) => void
}

function SegPoster({ seg }: { seg: Recording['segments'][0] }): React.ReactElement {
  const [src, setSrc] = React.useState('')
  React.useEffect(() => {
    setSrc('')
    window.stitcher.thumbAt(seg.path, seg.dur / 3).then(url => {
      if (url) setSrc(url)
    }).catch(() => {})
  }, [seg.path])

  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  return <div className="seg-poster-bg" />
}

export default function RecordingDetail({
  recording,
  confirmed,
  onConfirm,
  onReorder
}: RecordingDetailProps): React.ReactElement {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const total = recordingTotal(recording)

  return (
    <>
      {/* Header */}
      <div className="detail-head">
        <div style={{ flex: 1 }}>
          <div className="h2">{recording.label || `Recording ${recording.fileNumber}`}</div>
          <div className="meta">
            <span className="mono-accent">…{recording.fileNumber}</span>
            <span className="dot-sep" />
            {recording.segments.length} segment{recording.segments.length !== 1 ? 's' : ''}
            <span className="dot-sep" />
            {fmtClock(total)}
            <span className="dot-sep" />
            {recording.res} · {recording.fps}fps · {recording.codec}
            {recording.recorded && <><span className="dot-sep" />{recording.recorded}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 240 }}>
          {recording.mixedSpecs && <span className="chip warn"><Icon name="hd" size={13} /> mixed → auto re-wrap</span>}
          {recording.alreadyStitched && <span className="chip ok"><Icon name="check" size={13} /> already stitched</span>}
          {recording.single && <span className="chip mute">single clip</span>}
          {recording.selected
            ? <span className="chip accent"><Icon name="check" size={13} /> in stitch queue</span>
            : <span className="chip mute">not selected</span>
          }
        </div>
      </div>

      {/* Alerts */}
      {recording.mixedSpecs && (
        <div className="alert info">
          <span className="dot">i</span>
          <div className="grow">
            <span className="title">One segment has different specs.</span>
            {' '}It'll be re-wrapped into a matching container on stitch — lossless where possible, no quality change.
          </div>
        </div>
      )}
      {recording.single && recording.selected && (
        <div className="alert warning">
          <span className="dot">!</span>
          <div className="grow">
            <span className="title">This recording is a single clip.</span>
            {' '}There's nothing to stitch — it'll just be copied to the output folder as-is. Uncheck it to skip.
          </div>
        </div>
      )}
      {recording.alreadyStitched && (
        <div className="alert info">
          <span className="dot">i</span>
          <div className="grow">
            <span className="title">Already produced on a previous run.</span>
            {' '}Deselected by default so re-scanning is safe. Select it to stitch again — existing files get a (2) suffix, never overwritten.
          </div>
        </div>
      )}

      {/* Transition preview */}
      <div className="section-label"><Icon name="movie" size={14} /> Preview &amp; verify order</div>
      <TransitionPreview
        key={recording.fileNumber}
        recording={recording}
        confirmed={confirmed}
        onConfirm={onConfirm}
      />

      {/* Segment grid */}
      <div className="section-label" style={{ marginTop: 22, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="film" size={14} /> Segments · drag to reorder
        </span>
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--text-dim)' }}>
          defaults to chapter order
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {recording.segments.map((s, i) => (
          <div
            key={s.name}
            className={`seg-card${dragIdx === i ? ' dragging' : ''}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i)
              setDragIdx(null)
            }}
            onDragEnd={() => setDragIdx(null)}
          >
            <div className="seg-poster">
              <SegPoster seg={s} />
              <span style={{ position: 'absolute', left: 6, top: 6, background: 'rgba(12,14,18,0.7)', color: '#fff', fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Icon name="drag" size={11} /> {i + 1}
              </span>
              <span style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(12,14,18,0.78)', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }} className="mono">
                {fmtDur(s.dur)}
              </span>
            </div>
            <div className="seg-meta">
              <div className="seg-name mono">{s.name}</div>
              <div className="seg-sub">
                <span>ch {s.chapter}</span>
                {s.res !== recording.segments[0].res && (
                  <span className="chip warn" style={{ height: 16, fontSize: 9, padding: '0 6px' }}>{s.res}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
