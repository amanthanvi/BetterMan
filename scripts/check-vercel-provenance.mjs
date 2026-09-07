import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const provenanceType = 'https://slsa.dev/provenance/v1'

// Only consume reports from a successful npm audit signatures invocation: npm
// verifies package integrity, registry signatures, and the Sigstore bundles.
export async function requireVercelProvenance(report, version, verifyBundle) {
  if (!Array.isArray(report.invalid) || !Array.isArray(report.missing) || !Array.isArray(report.verified)
    || report.invalid.length || report.missing.length) throw new Error('npm signature audit did not pass')
  const entry = report.verified.find((item) => item.name === 'vercel' && item.version === version
    && item.location === 'node_modules/vercel' && item.registry === 'https://registry.npmjs.org/')
  const bundle = entry?.attestationBundles?.find((item) => item.predicateType === provenanceType)?.bundle
  if (entry?.attestations?.provenance?.predicateType !== provenanceType || !bundle?.dsseEnvelope?.payload) {
    throw new Error(`vercel@${version} has no verified SLSA provenance`)
  }
  // npm verifies the bundle but does not constrain its certificate identity.
  await verifyBundle(bundle, {
    certificateIdentityURI: 'https://github.com/vercel/vercel/.github/workflows/release.yml@refs/heads/main',
    certificateIssuer: 'https://token.actions.githubusercontent.com',
  })
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'))
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow
  const source = statement.predicate?.buildDefinition?.resolvedDependencies?.find((item) =>
    item.uri === 'git+https://github.com/vercel/vercel@refs/heads/main')
  if (statement.predicateType !== provenanceType
    || !statement.subject?.some((item) => item.name === `pkg:npm/vercel@${version}` && /^[a-f0-9]{128}$/.test(item.digest?.sha512 ?? ''))
    || workflow?.repository !== 'https://github.com/vercel/vercel'
    || workflow?.path !== '.github/workflows/release.yml'
    || workflow?.ref !== 'refs/heads/main'
    || !/^[a-f0-9]{40}$/.test(source?.digest?.gitCommit ?? '')) {
    throw new Error('Vercel provenance does not match the expected package and public release workflow')
  }
  return { version, sourceCommit: source.digest.gitCommit }
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).devDependencies.vercel
  const output = execFileSync('npm', ['audit', 'signatures', '--ignore-scripts', '--json', '--include-attestations'], {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const { verify } = await import('sigstore')
  const result = await requireVercelProvenance(JSON.parse(output), version, verify)
  console.log(`Verified vercel@${result.version} provenance from vercel/vercel@${result.sourceCommit} release.yml.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main() } catch (error) {
    console.error(error.status !== undefined ? `npm signature verification failed (exit ${error.status})` : error.message)
    process.exitCode = 1
  }
}
