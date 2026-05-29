/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.gopro-stitcher.app',
  productName: 'GoPro Stitcher',
  copyright: 'Copyright © 2026',
  directories: {
    buildResources: 'build',
    output: 'dist'
  },
  files: ['out/**'],
  asarUnpack: [
    '**/node_modules/ffmpeg-static/**',
    '**/node_modules/ffprobe-static/**'
  ],
  win: {
    icon: 'build/icon.png',
    target: [{ target: 'nsis', arch: ['x64'] }],
    requestedExecutionLevel: 'asInvoker'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  mac: {
    icon: 'build/icon.icns',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.video'
  },
  linux: {
    icon: 'build/icon.png',
    target: ['AppImage']
  }
}
