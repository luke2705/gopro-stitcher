import React, { useState, useEffect, useCallback } from 'react'
import type { Recording, StitchState, StitchItem } from './types'
import { recordingSizeGB, outName } from './utils'
import AppBar from './components/AppBar'
import ImportStage from './components/ImportStage'
import RecordingList from './components/RecordingList'
import RecordingDetail from './components/RecordingDetail'
import StitchModal from './components/StitchModal'

type Stage = 'import' | 'scanning' | 'dashboard'

type NamingPattern = '{file}_full' | '{date}_{file}' | '{label}'

function recompute(segs: Recording['segments']): Recording['segments'] {
  let t = 0
  return segs.map(s => {
    const n = { ...s, start: t }
    t += s.dur
    return n
  })
}

export default function App(): React.ReactElement {
  const [stage, setStage] = useState<Stage>('import')
  const [folder, setFolder] = useState<string>('')
  const [output, setOutput] = useState<string>('')
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [ignored, setIgnored] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<Record<string, Record<number, boolean>>>({})
  const [stitch, setStitch] = useState<StitchState | null>(null)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0, current: '' })
  const [naming] = useState<NamingPattern>('{file}_full')

  // Wire up scan progress listener
  useEffect(() => {
    const unsub = window.stitcher.onScanProgress(p => {
      setScanProgress({ done: p.done, total: p.total, current: p.current || '' })
    })
    return unsub
  }, [])

  // Wire up stitch progress listener
  useEffect(() => {
    const unsub = window.stitcher.onStitchProgress(p => {
      setStitch(prev => {
        if (!prev) return prev
        const items = prev.items.map(x =>
          x.id === p.id ? { ...x, pct: p.pct, done: p.done, error: p.error } : x
        )
        const doneAll = items.every(x => x.done)
        return { items, doneAll }
      })
    })
    return unsub
  }, [])

  async function pickAndScan() {
    const picked = await window.stitcher.pickFolder()
    if (!picked) return
    startScan(picked)
  }

  async function startScan(dir: string) {
    setFolder(dir)
    setScanProgress({ done: 0, total: 0, current: '' })
    setStage('scanning')

    // Default output to same parent dir + /Stitched
    const defaultOut = dir + (dir.includes('\\') ? '\\Stitched' : '/Stitched')
    setOutput(defaultOut)

    try {
      const result = await window.stitcher.scan(dir, defaultOut)
      setRecordings(result.recordings)
      setIgnored(result.ignored)
      setSelectedId(result.recordings[0]?.fileNumber ?? null)
      setConfirmed({})
      setStage('dashboard')
    } catch (err) {
      console.error('Scan failed', err)
      setStage('import')
    }
  }

  function toggleSelect(fileNumber: string) {
    setRecordings(prev =>
      prev.map(r => r.fileNumber === fileNumber ? { ...r, selected: !r.selected } : r)
    )
  }

  function selectAllStitchable() {
    const nonSingle = recordings.filter(r => !r.single)
    const allOn = nonSingle.every(r => r.selected)
    setRecordings(prev =>
      prev.map(r => r.single ? r : { ...r, selected: !allOn })
    )
  }

  function setConfirmCut(fileNumber: string, cutIdx: number, value: boolean) {
    setConfirmed(prev => ({
      ...prev,
      [fileNumber]: { ...(prev[fileNumber] || {}), [cutIdx]: value }
    }))
  }

  function reorder(from: number, to: number) {
    if (!selectedId) return
    setRecordings(prev =>
      prev.map(r => {
        if (r.fileNumber !== selectedId) return r
        const segs = [...r.segments]
        const [moved] = segs.splice(from, 1)
        segs.splice(to, 0, moved)
        return { ...r, segments: recompute(segs) }
      })
    )
    setConfirmed(prev => ({ ...prev, [selectedId]: {} }))
  }

  async function changeOutput() {
    const picked = await window.stitcher.pickOutputDir()
    if (picked) setOutput(picked)
  }

  function startStitch() {
    const selected = recordings.filter(r => r.selected)
    const items: StitchItem[] = selected.map(r => {
      const name = outName(r.fileNumber, r.label || r.fileNumber, r.recorded, naming)
      const rewrapIndexes = r.mixedSpecs
        ? r.segments.map((s, i) => (s.res !== r.segments[0].res ? i : -1)).filter(i => i >= 0)
        : []
      return {
        id: r.fileNumber,
        name,
        pct: 0,
        done: false,
        segments: r.segments.length,
        sizeGB: recordingSizeGB(r),
        rewrap: r.mixedSpecs
      }
    })
    setStitch({ items, doneAll: false })

    const jobs = selected.map(r => {
      const name = outName(r.fileNumber, r.label || r.fileNumber, r.recorded, naming)
      const rewrapIndexes = r.mixedSpecs
        ? r.segments.map((s, i) => (s.res !== r.segments[0].res ? i : -1)).filter(i => i >= 0)
        : []
      return {
        fileNumber: r.fileNumber,
        segmentPaths: r.segments.map(s => s.path),
        rewrapIndexes,
        outputName: name
      }
    })

    window.stitcher.stitch(jobs, output).catch(err => {
      console.error('Stitch failed', err)
    })
  }

  const sel = recordings.find(r => r.fileNumber === selectedId) ?? recordings[0]
  const selectedRecs = recordings.filter(r => r.selected)
  const totalGB = selectedRecs.reduce((a, r) => a + recordingSizeGB(r), 0)

  // ---------- Import / Scanning ----------
  if (stage !== 'dashboard') {
    return (
      <div className="app">
        <AppBar />
        <ImportStage
          scanning={stage === 'scanning'}
          scanProgress={scanProgress}
          folder={folder}
          onPickFolder={pickAndScan}
          onDropFolder={startScan}
        />
      </div>
    )
  }

  // ---------- Dashboard ----------
  return (
    <div className="app">
      <AppBar folder={folder} onReopen={() => setStage('import')} />

      <div className="body">
        <RecordingList
          recordings={recordings}
          ignored={ignored}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onToggle={toggleSelect}
          onSelectAll={selectAllStitchable}
        />

        <section className="detail">
          {sel && (
            <div className="detail-scroll">
              <RecordingDetail
                recording={sel}
                confirmed={confirmed[sel.fileNumber] || {}}
                onConfirm={(idx, val) => setConfirmCut(sel.fileNumber, idx, val)}
                onReorder={reorder}
              />
            </div>
          )}

          <div className="action-bar">
            <div className="out">
              <span className="lab">Save to</span>
              <span className="path">
                {output || '…'}
                <span className="chg" onClick={changeOutput}>Change…</span>
              </span>
            </div>
            <div className="spacer" />
            <div className="summary">
              <div><b>{selectedRecs.length}</b> selected → <b>{selectedRecs.length}</b> file{selectedRecs.length !== 1 ? 's' : ''}</div>
              <div>~{totalGB.toFixed(1)} GB · lossless concat (no re-encode)</div>
            </div>
            <button
              className="btn primary lg"
              disabled={selectedRecs.length === 0}
              onClick={startStitch}
            >
              Stitch {selectedRecs.length} selected
            </button>
          </div>
        </section>
      </div>

      {stitch && (
        <StitchModal
          stitch={stitch}
          output={output}
          onClose={() => setStitch(null)}
          onOpenFolder={() => window.stitcher.openFolder(output)}
        />
      )}
    </div>
  )
}
