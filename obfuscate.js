/**
 * Obfuscates the packaged Electron bundles before electron-builder packs them.
 * Runs on the electron-vite build output (out/), NOT the sources — same
 * pipeline as E:\YTStudio\obfuscate.js.
 *
 * - main + preload: full node-target obfuscation (same config as YTStudio)
 * - renderer: browser-target obfuscation (milder — React can break under
 *   transformObjectKeys/deadCodeInjection, so those are disabled there)
 *
 * Run manually: node obfuscate.js
 * Run via build: npm run electron:build / electron:deploy
 */
const fs = require('fs')
const path = require('path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const outDir = path.join(__dirname, 'obfuscated')

// node bundles — full obfuscation, matches E:\YTStudio\obfuscate.js
const nodeFiles = ['out/main/index.js', 'out/preload/index.js']

const nodeObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'node',
  sourceMap: false
}

// renderer bundle(s) — the bridge logic lives here; obfuscate it too but keep
// React-compatible: no deadCodeInjection, no transformObjectKeys, no stringArray
// split that could break DOM/JSX attribute lookups.
const rendererObfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.3,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.4,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'browser',
  sourceMap: false
}

function listRendererBundles() {
  const dir = path.join(__dirname, 'out', 'renderer', 'assets')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => `out/renderer/assets/${f}`)
}

console.log('Obfuscating app bundles...')

let hasErrors = false
let obfuscatedCount = 0

fs.rmSync(outDir, { recursive: true, force: true })

function obfuscateFile(relPath, options, label) {
  const filePath = path.join(__dirname, relPath)
  const outPath = path.join(outDir, relPath)

  if (!fs.existsSync(filePath)) {
    console.warn(`  SKIP (not found — run 'npm run build' first): ${relPath}`)
    return false
  }

  try {
    console.log(`  Obfuscating ${relPath} (${label})...`)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const obfuscationResult = JavaScriptObfuscator.obfuscate(fileContent, options)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, obfuscationResult.getObfuscatedCode())
    console.log(`  -> Saved to obfuscated/${relPath}`)
    return true
  } catch (error) {
    console.error(`Error obfuscating ${relPath}:`, error)
    hasErrors = true
    return false
  }
}

for (const relPath of nodeFiles) {
  if (obfuscateFile(relPath, nodeObfuscatorOptions, 'node')) obfuscatedCount++
}

for (const relPath of listRendererBundles()) {
  if (obfuscateFile(relPath, rendererObfuscatorOptions, 'browser')) obfuscatedCount++
}

if (hasErrors) {
  console.error('\nObfuscation completed with errors.')
  process.exit(1)
} else if (obfuscatedCount === 0) {
  console.error('\nNo files were obfuscated — run `npm run build` first.')
  process.exit(1)
} else {
  console.log(`\nAll files successfully obfuscated (${obfuscatedCount})!`)
}