declare module 'ffmpeg-static' {
  const path: string | null
  export default path
}

declare module 'ffprobe-static' {
  const info: { path: string; version: string; arch: string; platform: string }
  export default info
}
