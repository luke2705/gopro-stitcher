import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Recording } from '../types'
import { fmtClock, recordingTotal, mediaUrl } from '../utils'
import Icon from './Icon'

interface Junction {
  index: number
  at: number          // absolute timecode in seconds
  out: Recording['segments'][0]
  inc: Recording['segments'][0]
  rewrapped: boolean
}

interface TransitionPreviewProps {
  recording: Recording
  confirmed: Record<number, boolean>
  onConfirm: (cutIndex: number, value: boolean) => void
}

// Thumbnail loaded lazily from IPC
function Thumbnail({
  clipPath,
  seconds,
  style,
  label,
  sub
}: {
  clipPath: string
  seconds: number
  style?: React.CSSProperties
  label?: string
  sub?: string
}): React.ReactElement {
  const [src, setSrc] = useState('')

  useEffect(() => {
    setSrc('')
    window.stitcher.thumbAt(clipPath, seconds).then(url => {
      if (url) setSrc(url)
    }).catch(() => {})
  }, [clipPath, seconds])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#0c0e12', ...style }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', background: 'var(--fill)' }} />
      }
      {(label || sub) && (
        <div style={{ position: 'absolute', left: 10, bottom: 9, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {label && <span className="mono" style={{ color: '#fff', fontSize: 11, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{label}</span>}
          {sub && <span className="mono" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

export default function TransitionPreview({
  recording,
  confirmed,
  onConfirm
}: TransitionPreviewProps): React.ReactElement {
  const segs = recording.segments
  const total = recordingTotal(recording)

  const junctions: Junction[] = segs.slice(1).map((s, i) => ({
    index: i,
    at: s.start,
    out: segs[i],
    inc: s,
    rewrapped: recording.mixedSpecs && segs[i].res !== s.res
  }))

  const [cutIdx, setCutIdx] = useState(0)
  const [mode, setMode] = useState<'compare' | 'play'>(junctions.length ? 'compare' : 'play')
  const [abs, setAbs] = useState(junctions.length ? junctions[0].at : 0)
  const [playing, setPlaying] = useState(false)

  // Two video refs — one per side of current junction
  const outVideoRef = useRef<HTMLVideoElement>(null)
  const inVideoRef = useRef<HTMLVideoElement>(null)
  const playUntilRef = useRef<number | null>(null)
  const activeVideoRef = useRef<'out' | 'in'>('out')
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  const j = junctions[cutIdx] ?? null

  // Sync abs position display during playback using rAF
  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    lastTimeRef.current = performance.now()
    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      setAbs(prev => {
        const next = prev + dt
        if (playUntilRef.current !== null && next >= playUntilRef.current) {
          return playUntilRef.current
        }
        return Math.min(next, total)
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, total])

  function segAt(t: number): Recording['segments'][0] {
    for (let i = segs.length - 1; i >= 0; i--) {
      if (t >= segs[i].start - 0.001) return segs[i]
    }
    return segs[0]
  }

  const playCut = useCallback((idx: number) => {
    const jj = junctions[idx]
    if (!jj) return

    const from = Math.max(0, jj.at - 1.6)
    const until = Math.min(total, jj.at + 1.6)
    playUntilRef.current = until
    activeVideoRef.current = 'out'

    const outVid = outVideoRef.current
    const inVid = inVideoRef.current
    if (outVid && inVid) {
      // Preload: park incoming at start
      inVid.currentTime = 0.05
      // Seek outgoing to 1.6s before cut
      const outOffset = jj.at - jj.out.start
      outVid.currentTime = Math.max(0, outOffset - 1.6)

      outVid.play().catch(() => {})
    }

    setCutIdx(idx)
    setAbs(from)
    setMode('play')
    setPlaying(true)
  }, [junctions, total])

  function gotoCut(idx: number, autoplay = true) {
    if (autoplay) {
      playCut(idx)
    } else {
      const jj = junctions[idx]
      setCutIdx(idx)
      setAbs(jj.at)
      setMode('compare')
      setPlaying(false)
      playUntilRef.current = null
      if (outVideoRef.current) outVideoRef.current.pause()
      if (inVideoRef.current) inVideoRef.current.pause()
    }
  }

  // Handle video "timeupdate" to orchestrate outgoing → incoming swap and stop
  useEffect(() => {
    const jj = junctions[cutIdx]
    if (!jj) return
    const outVid = outVideoRef.current
    const inVid = inVideoRef.current
    if (!outVid || !inVid) return

    function onOutTimeUpdate() {
      if (!jj) return
      const outOffset = jj.at - jj.out.start
      if (activeVideoRef.current === 'out' && outVid!.currentTime >= outOffset - 0.05) {
        // Swap to incoming
        outVid!.pause()
        activeVideoRef.current = 'in'
        inVid!.currentTime = 0.05
        inVid!.play().catch(() => {})
      }
    }

    function onInTimeUpdate() {
      if (activeVideoRef.current !== 'in') return
      const until = playUntilRef.current
      if (until !== null) {
        const jj2 = junctions[cutIdx]
        if (!jj2) return
        const inOffset = (until - jj2.at) + 0.05
        if (inVid!.currentTime >= inOffset) {
          inVid!.pause()
          setPlaying(false)
          setMode('compare')
          playUntilRef.current = null
          setAbs(jj2.at)
        }
      }
    }

    outVid.addEventListener('timeupdate', onOutTimeUpdate)
    inVid.addEventListener('timeupdate', onInTimeUpdate)
    return () => {
      outVid.removeEventListener('timeupdate', onOutTimeUpdate)
      inVid.removeEventListener('timeupdate', onInTimeUpdate)
    }
  }, [cutIdx, junctions])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      outVideoRef.current?.pause()
      inVideoRef.current?.pause()
      return
    }
    playUntilRef.current = null
    setMode('play')
    const vid = activeVideoRef.current === 'in' ? inVideoRef.current : outVideoRef.current
    vid?.play().catch(() => {})
    setPlaying(true)
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const t = p * total
    setAbs(t)
    setMode('play')
    setPlaying(false)
    playUntilRef.current = null
    outVideoRef.current?.pause()
    inVideoRef.current?.pause()

    // Seek the appropriate video
    const seg = segAt(t)
    const segIdx = segs.indexOf(seg)
    // Load the correct video by updating cutIdx context
    const nearestJunctionIdx = junctions.reduce((best, jj, i) => {
      return Math.abs(jj.at - t) < Math.abs(junctions[best]?.at - t || Infinity) ? i : best
    }, 0)
    setCutIdx(nearestJunctionIdx)
  }

  const curSeg = segAt(abs)
  const cutsAllOk = junctions.length > 0 && junctions.every(jj => confirmed[jj.index])

  // For the play view, determine which video src to show
  const showOutgoing = mode === 'play' && j && activeVideoRef.current === 'out'
  const showIncoming = mode === 'play' && j && activeVideoRef.current === 'in'

  return (
    <div>
      {/* Stage */}
      <div style={{ background: '#0c0e12', borderRadius: 10, padding: 10, border: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 660, margin: '0 auto', aspectRatio: '16 / 9' }}>

          {mode === 'compare' && j ? (
            /* Split compare view */
            <div style={{ position: 'absolute', inset: 0, display: 'flex', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                <Thumbnail
                  clipPath={j.out.path}
                  seconds={Math.max(0, j.out.dur - 0.1)}
                  style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
                  label={j.out.name}
                  sub={`ch ${j.out.chapter} · ends ${fmtClock(j.at)}`}
                />
                <span style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4 }}>
                  OUTGOING
                </span>
              </div>
              <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                <Thumbnail
                  clipPath={j.inc.path}
                  seconds={0.1}
                  style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
                  label={j.inc.name}
                  sub={`ch ${j.inc.chapter} · starts ${fmtClock(j.at)}`}
                />
                <span style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, padding: '2px 7px', borderRadius: 4 }}>
                  INCOMING
                </span>
              </div>
              {/* Seam */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.9)', transform: 'translateX(-50%)', boxShadow: '0 0 8px rgba(0,0,0,0.4)' }} />
              {/* Cut badge */}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(12,14,18,0.85)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, padding: '5px 11px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.2)' }}>
                <Icon name="cut" size={13} /> CUT {cutIdx + 1} · {fmtClock(j.at)}
              </div>
              {j.rewrapped && (
                <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', background: 'rgba(154,91,0,0.92)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  <Icon name="hd" size={13} /> mixed specs → re-wrapped
                </div>
              )}
            </div>
          ) : (
            /* Play view — video elements */
            <div style={{ position: 'absolute', inset: 0 }}>
              {j && (
                <>
                  <video
                    ref={outVideoRef}
                    src={mediaUrl(j.out.path)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: showIncoming ? 'none' : 'block' }}
                    preload="auto"
                    playsInline
                  />
                  <video
                    ref={inVideoRef}
                    src={mediaUrl(j.inc.path)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: showIncoming ? 'block' : 'none' }}
                    preload="auto"
                    playsInline
                  />
                </>
              )}
              {!j && segs[0] && (
                <video
                  ref={outVideoRef}
                  src={mediaUrl(segs[0].path)}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                  preload="auto"
                  playsInline
                />
              )}
              {!playing && (
                <button onClick={togglePlay} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 60, height: 60, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.85)', background: 'rgba(12,14,18,0.45)', color: '#fff', display: 'grid', placeItems: 'center', paddingLeft: 4 }} aria-label="Play">
                  <Icon name="play" size={30} />
                </button>
              )}
            </div>
          )}

          {/* Timecode overlay */}
          <div style={{ position: 'absolute', right: 8, top: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>
            {fmtClock(abs)} <span style={{ opacity: 0.55 }}>/ {fmtClock(total)}</span>
          </div>
        </div>

        {/* Transport + timeline */}
        <div style={{ maxWidth: 660, margin: '10px auto 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button className="icon-btn" onClick={togglePlay} style={{ color: '#fff' }} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={22} />
            </button>
            <span className="mono" style={{ color: '#fff', fontSize: 12, minWidth: 96 }}>
              {fmtClock(abs)} <span style={{ opacity: 0.5 }}>/ {fmtClock(total)}</span>
            </span>
            <div style={{ flex: 1 }} />
            {junctions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="icon-btn" style={{ color: '#fff' }} disabled={cutIdx === 0} onClick={() => gotoCut(Math.max(0, cutIdx - 1))} aria-label="Previous cut">
                  <Icon name="prev" size={20} />
                </button>
                <span className="mono" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  Cut {cutIdx + 1} of {junctions.length}
                </span>
                <button className="icon-btn" style={{ color: '#fff' }} disabled={cutIdx === junctions.length - 1} onClick={() => gotoCut(Math.min(junctions.length - 1, cutIdx + 1))} aria-label="Next cut">
                  <Icon name="next" size={20} />
                </button>
                <button className="btn sm" style={{ background: 'var(--accent)', color: '#fff', marginLeft: 4 }} onClick={() => playCut(cutIdx)}>
                  <Icon name="play" size={15} /> Play cut
                </button>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div
            style={{ position: 'relative', height: 34, userSelect: 'none', cursor: 'pointer' }}
            onClick={handleTimelineClick}
          >
            <div style={{ position: 'absolute', inset: '0 0 14px 0', display: 'flex', gap: 2, borderRadius: 5, overflow: 'hidden' }}>
              {segs.map((s, i) => (
                <div key={i} style={{
                  flexGrow: s.dur, flexBasis: 0, position: 'relative',
                  background: `hsl(${(i * 37) % 360}, ${curSeg === s ? 55 : 38}%, ${curSeg === s ? 52 : 36}%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span className="mono" style={{ color: '#fff', fontSize: 9.5, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
                    ch {s.chapter}
                  </span>
                </div>
              ))}
            </div>

            {/* Junction diamonds */}
            {junctions.map((jj, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); gotoCut(i) }}
                aria-label={`Cut ${i + 1}`}
                style={{
                  position: 'absolute', top: -3, left: `${(jj.at / total) * 100}%`,
                  transform: 'translateX(-50%)', width: 15, height: 15, padding: 0,
                  border: '2px solid #0c0e12', borderRadius: 3, rotate: '45deg',
                  background: confirmed[jj.index]
                    ? 'var(--success)'
                    : (i === cutIdx && mode === 'compare' ? 'var(--accent)' : '#fff'),
                  cursor: 'pointer', zIndex: 2
                }}
              />
            ))}

            {/* Playhead */}
            <div style={{ position: 'absolute', top: -4, bottom: 14, left: `${(abs / total) * 100}%`, width: 2, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Confirm strip */}
      {junctions.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="section-label" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="cut" size={14} /> Confirm transitions
            </span>
            <span className={`chip ${cutsAllOk ? 'ok' : 'mute'}`}>
              {cutsAllOk
                ? <><Icon name="check" size={13} /> all {junctions.length} confirmed</>
                : `${Object.values(confirmed).filter(Boolean).length} / ${junctions.length} confirmed`
              }
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {junctions.map((jj, i) => {
              const ok = confirmed[jj.index]
              const active = i === cutIdx && mode === 'compare'
              return (
                <div
                  key={i}
                  onClick={() => gotoCut(i)}
                  style={{
                    flex: '0 0 auto', width: 188, borderRadius: 10, padding: 8, cursor: 'pointer',
                    background: 'var(--panel-2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    boxShadow: active ? '0 0 0 1px var(--accent), 0 8px 22px -10px var(--accent)' : 'none',
                    transition: 'border-color 120ms, box-shadow 120ms'
                  }}
                >
                  <div style={{ display: 'flex', gap: 3, borderRadius: 5, overflow: 'hidden', height: 56, position: 'relative' }}>
                    <Thumbnail clipPath={jj.out.path} seconds={Math.max(0, jj.out.dur - 0.1)} style={{ flex: 1 }} />
                    <Thumbnail clipPath={jj.inc.path} seconds={0.1} style={{ flex: 1 }} />
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.85)', transform: 'translateX(-50%)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                    <div>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>Cut {i + 1} · ch {jj.out.chapter}→{jj.inc.chapter}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{fmtClock(jj.at)}{jj.rewrapped ? ' · re-wrapped' : ''}</div>
                    </div>
                    <button
                      className={`chip ${ok ? 'ok' : 'mute'}`}
                      style={{ cursor: 'pointer', height: 24 }}
                      onClick={e => { e.stopPropagation(); onConfirm(jj.index, !ok) }}
                    >
                      {ok ? <><Icon name="check" size={13} /> OK</> : 'Mark OK'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="alert info" style={{ marginTop: 16, marginBottom: 0 }}>
          <span className="dot">i</span>
          <div className="grow">
            <span className="title">Single clip — no transitions to confirm.</span>
            {' '}There's only one segment in this recording, so there's nothing to stitch.
          </div>
        </div>
      )}
    </div>
  )
}
