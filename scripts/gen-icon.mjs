/**
 * Generates build/icon.png (512×512) by rendering an HTML canvas via Electron.
 * Run: node scripts/gen-icon.mjs
 */
import { _electron as electron } from 'playwright-core'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BUILD_DIR = path.join(ROOT, 'build')
fs.mkdirSync(BUILD_DIR, { recursive: true })

// Write a self-contained HTML page that draws the icon on a canvas
const HTML = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; }
  body { width:512px; height:512px; overflow:hidden; background:transparent; }
  canvas { display:block; }
</style>
</head>
<body>
<canvas id="c" width="512" height="512"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const S = 512;

// ── Background: dark rounded square ──────────────────────────────────────────
const r = 96; // corner radius
ctx.beginPath();
ctx.moveTo(r, 0);
ctx.lineTo(S - r, 0);
ctx.quadraticCurveTo(S, 0, S, r);
ctx.lineTo(S, S - r);
ctx.quadraticCurveTo(S, S, S - r, S);
ctx.lineTo(r, S);
ctx.quadraticCurveTo(0, S, 0, S - r);
ctx.lineTo(0, r);
ctx.quadraticCurveTo(0, 0, r, 0);
ctx.closePath();

// Rich dark gradient - slight blue tint top, deeper at bottom
const bgGrad = ctx.createLinearGradient(0, 0, 0, S);
bgGrad.addColorStop(0,   '#1A1D28');
bgGrad.addColorStop(0.5, '#12141E');
bgGrad.addColorStop(1,   '#0B0C10');
ctx.fillStyle = bgGrad;
ctx.fill();

// Subtle accent glow - top right corner
const glowGrad = ctx.createRadialGradient(S, 0, 0, S * 0.7, 0, S * 0.9);
glowGrad.addColorStop(0,   'rgba(255, 92, 43, 0.18)');
glowGrad.addColorStop(1,   'rgba(255, 92, 43, 0)');
ctx.fillStyle = glowGrad;
ctx.fill();

// ── Draw scissors / cut icon ──────────────────────────────────────────────────
// Scale the 24x24 SVG path to fit ~280px centered at (256,256)
const ICON_SIZE = 280;
const OFFSET = (S - ICON_SIZE) / 2;
const scale = ICON_SIZE / 24;

ctx.save();
ctx.translate(OFFSET, OFFSET);
ctx.scale(scale, scale);

// Orange gradient fill for the icon
const iconGrad = ctx.createLinearGradient(0, 0, 24, 24);
iconGrad.addColorStop(0, '#FF7A4A');
iconGrad.addColorStop(0.5, '#FF5C2B');
iconGrad.addColorStop(1, '#E04010');
ctx.fillStyle = iconGrad;

// The scissors SVG path (24x24 viewBox)
const p = new Path2D('M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z');
ctx.fill(p);

ctx.restore();

// ── Subtle inner highlight ring ───────────────────────────────────────────────
ctx.save();
ctx.beginPath();
ctx.moveTo(r, 0);
ctx.lineTo(S - r, 0);
ctx.quadraticCurveTo(S, 0, S, r);
ctx.lineTo(S, S - r);
ctx.quadraticCurveTo(S, S, S - r, S);
ctx.lineTo(r, S);
ctx.quadraticCurveTo(0, S, 0, S - r);
ctx.lineTo(0, r);
ctx.quadraticCurveTo(0, 0, r, 0);
ctx.closePath();
ctx.strokeStyle = 'rgba(255,255,255,0.07)';
ctx.lineWidth = 2;
ctx.stroke();
ctx.restore();

// Signal to the driver that we're done
document.title = 'READY';
</script>
</body>
</html>`

const htmlPath = path.join(BUILD_DIR, '_icon-render.html')
fs.writeFileSync(htmlPath, HTML)

const electronBin = path.join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', ROOT],
  env: { ...process.env },
  timeout: 30_000,
})

// Wait for existing window to appear, then navigate to our icon page
await new Promise(r => setTimeout(r, 3_000))
const page = app.windows()[0] ?? await app.firstWindow()

await page.goto(`file://${htmlPath}`)
await page.waitForFunction(() => document.title === 'READY', { timeout: 10_000 })

// Screenshot just the canvas element
const canvas = await page.$('#c')
const iconPath = path.join(BUILD_DIR, 'icon.png')
await canvas.screenshot({ path: iconPath })
console.log('icon written →', iconPath)

await app.close()

// Clean up temp HTML
fs.unlinkSync(htmlPath)
