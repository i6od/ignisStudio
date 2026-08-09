const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = path.join(os.tmpdir(), 'vc-db-smoke-result.txt')

function report(line) {
  fs.appendFileSync(OUT, line + '\n')
}

app.whenReady().then(async () => {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-db-smoke-'))
    process.env.VCONNECT_DB_PATH = path.join(dir, 'test.db')
    // Build db.cjs fresh — a clean `npm run build` wipes out/main
    require('child_process').execSync(
      path.join(__dirname, '..', 'node_modules', '.bin', 'esbuild') +
        ' src/main/db.ts --bundle --format=cjs --platform=node --packages=external --outfile=out/main/db.cjs',
      { cwd: path.join(__dirname, '..'), stdio: 'ignore' }
    )

    const { recordEvent, getTopSupporters, getSummary, resetSupporters } = require('../out/main/db.cjs')

    recordEvent({ type: 'gift', userId: 'u1', nickname: 'alice', repeatCount: 2, diamondCount: 10 })
    recordEvent({ type: 'gift', userId: 'u1', nickname: 'alice', repeatCount: 1, diamondCount: 5 })
    recordEvent({ type: 'gift', userId: 'u2', nickname: 'bob', repeatCount: 5, diamondCount: 1 })
    recordEvent({ type: 'like', userId: 'u3', nickname: 'carol', likeCount: 50 })
    recordEvent({ type: 'like', userId: 'u1', nickname: 'alice', likeCount: 25 })
    recordEvent({ type: 'comment', userId: 'u2', nickname: 'bob' })
    recordEvent({ type: 'comment', userId: 'u2', nickname: 'bob' })
    recordEvent({ type: 'follow', userId: 'u4', nickname: 'dave' })

    const topGifts = getTopSupporters('gifts', 10)
    const topLikes = getTopSupporters('likes', 10)
    const topComments = getTopSupporters('comments', 10)
    const summary = getSummary()

    const ok = (cond, msg) => {
      report((cond ? 'PASS: ' : 'FAIL: ') + msg)
    }

    ok(topGifts.length === 2, `top gifters got ${topGifts.length} expected 2`)
    ok(topGifts[0] && topGifts[0].user_key === 'u1' && topGifts[0].diamonds === 25,
      `gift ranking u1 diamonds=25 (got ${topGifts[0] && topGifts[0].diamonds})`)
    ok(topLikes[0] && topLikes[0].user_key === 'u3' && topLikes[0].likes_count === 50, 'like ranking u3 likes=50')
    ok(topComments[0] && topComments[0].user_key === 'u2' && topComments[0].comments_count === 2, 'comment ranking u2 comments=2')
    ok(summary.total === 4, `summary total=4 (got ${summary.total})`)
    ok(summary.topGifter && summary.topGifter.nickname === 'alice', 'summary topGifter=alice')

    resetSupporters()
    ok(getSummary().total === 0, 'reset worked')

    report('ALL DB TESTS PASSED')
  } catch (e) {
    report('ERROR: ' + (e && e.stack ? e.stack : e))
  }
  app.exit(0)
})