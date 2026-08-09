/**
 * Obfuscates the packaged Electron main-process bundles before electron-builder
 * packs them. Runs on the electron-vite build output (out/), NOT the sources —
 * same pipeline as E:\YTStudio\obfuscate.js.
 *
 * Run manually: node obfuscate.js
 * Run via build: npm run electron:build / electron:deploy
 */
const fs = require('fs')
const path = require('path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const filesToObfuscate = ['out/main/index.js', 'out/preload/index.js']

const outDir = path.join(__dirname, 'obfuscated')

const obfuscatorOptions = {
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

console.log('Obfuscating app bundles...')

let hasErrors = false
let obfuscatedCount = 0

// Clean output dir for a fresh copy each time
fs.rmSync(outDir, { recursive: true, force: true })

for (const relPath of filesToObfuscate) {
  const filePath = path.join(__dirname, relPath)
  const outPath = path.join(outDir, relPath)

  if (!fs.existsSync(filePath)) {
    console.warn(`  SKIP (not found — run 'npm run build' first): ${relPath}`)
    continue
  }

  try {
    console.log(`  Obfuscating ${relPath}...`)
    const fileContent = fs.readFileSync(filePath, 'utf8')

    const obfuscationResult = JavaScriptObfuscator.obfuscate(
      fileContent,
      obfuscatorOptions
    )
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, obfuscationResult.getObfuscatedCode())
    console.log(`  -> Saved to obfuscated/${relPath}`)
    obfuscatedCount++
  } catch (error) {
    console.error(`Error obfuscating ${relPath}:`, error)
    hasErrors = true
  }
}

if (hasErrors) {
  console.error('\nObfuscation completed with errors.')
  process.exit(1)
} else if (obfuscatedCount === 0) {
  console.error('\nNo files were obfuscated — run `npm run build` first.')
  process.exit(1)
} else {
  console.log('\nAll files successfully obfuscated!')
}