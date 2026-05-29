export type { Segment, Recording, ScanResult, ScanProgress, StitchJob, StitchProgress } from '../../shared/types'
export type { StitcherAPI } from '../../preload/index'

export interface StitchItem {
  id: string         // fileNumber
  name: string       // output filename
  pct: number
  done: boolean
  segments: number
  sizeGB: number
  rewrap: boolean
  error?: string
}

export interface StitchState {
  items: StitchItem[]
  doneAll: boolean
}
