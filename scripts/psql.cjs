// Safe psql wrapper: never prints the connection string or spawn internals.
// Usage: node --env-file=.env.local scripts/psql.cjs (-f <file.sql> | -c "<single SQL>")
const { spawnSync } = require('node:child_process')

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL not set')
  process.exit(1)
}
const [flag, value] = process.argv.slice(2)
if ((flag !== '-f' && flag !== '-c') || !value) {
  console.error('usage: psql.cjs (-f <file.sql> | -c "<sql>")')
  process.exit(1)
}
const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-At', flag, value], { encoding: 'utf8' })
// psql may echo a connection URI in its own errors; never forward it
const redact = (s) => s.replace(/postgres(ql)?:\/\/[^\s"']+/g, 'postgres://***')
if (r.stdout) process.stdout.write(r.stdout)
if (r.status === null) {
  // spawn failure or signal: r.error can carry the argv (and so the URL); print only its code
  console.error(`psql failed to start ${r.error?.code ?? r.signal ?? ''}`.trim())
  process.exit(1)
}
if (r.status !== 0) {
  if (r.stderr) process.stderr.write(redact(r.stderr))
  process.exit(1)
}
// psql prints NOTICEs on stderr even on success; pass them through
if (r.stderr) process.stderr.write(redact(r.stderr))
