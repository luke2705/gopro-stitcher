import React from 'react'
import type { StitchState } from '../types'
import Icon from './Icon'

interface StitchModalProps {
  stitch: StitchState
  output: string
  onClose: () => void
  onOpenFolder: () => void
}

export default function StitchModal({
  stitch,
  output,
  onClose,
  onOpenFolder
}: StitchModalProps): React.ReactElement {
  const { items, doneAll } = stitch
  const completed = items.filter(x => x.done).length

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(12,14,18,0.5)',
      display: 'grid', placeItems: 'center', zIndex: 60
    }}>
      <div style={{
        width: 'min(560px, 92vw)', background: 'var(--panel)', borderRadius: 16,
        boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px var(--border)',
        overflow: 'hidden', maxHeight: '86vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {doneAll
              ? <span style={{ color: 'var(--success)' }}><Icon name="done" size={24} /></span>
              : <span style={{ color: 'var(--accent)' }}><Icon name="cut" size={22} /></span>
            }
            <div className="h2" style={{ fontSize: 18 }}>{doneAll ? 'Stitch complete' : 'Stitching…'}</div>
          </div>
          {doneAll && (
            <button className="icon-btn" onClick={onClose}><Icon name="close" size={20} /></button>
          )}
        </div>

        {/* Item list */}
        <div style={{ padding: '8px 20px 4px', overflowY: 'auto', flex: 1 }}>
          {items.map(x => (
            <div key={x.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{x.name}</span>
                {x.error
                  ? <span className="chip" style={{ background: 'color-mix(in srgb, var(--error) 16%, transparent)', color: 'var(--error)' }}>Error</span>
                  : x.done
                    ? <span className="chip ok"><Icon name="check" size={13} /> Done</span>
                    : <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{Math.round(x.pct)}%</span>
                }
              </div>
              <div style={{ height: 8, background: 'var(--fill)', borderRadius: 100, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, x.pct)}%`, height: '100%',
                  background: x.error ? 'var(--error)' : x.done ? 'var(--success)' : 'var(--accent)',
                  transition: 'width 200ms'
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
                {x.error
                  ? x.error
                  : x.done
                    ? `Joined ${x.segments} segments · ${x.sizeGB.toFixed(1)} GB · no re-encode`
                    : `Concatenating ${x.segments} segments${x.rewrap ? ' · re-wrapping mixed chapter' : ''}…`
                }
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--panel-2)' }}>
          {doneAll ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {completed} file{completed !== 1 ? 's' : ''} saved to{' '}
                <span className="mono" style={{ color: 'var(--text)' }}>{output}</span>
              </span>
              <div style={{ flex: 1 }} />
              <button className="btn outlined" onClick={onClose}>Close</button>
              <button className="btn primary" onClick={onOpenFolder}>
                <Icon name="open" size={18} /> Open folder
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {completed} of {items.length} complete · lossless stream copy
              </span>
              <div style={{ flex: 1 }} />
              <button className="btn outlined" onClick={() => { window.stitcher.cancelStitch(); onClose() }}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
