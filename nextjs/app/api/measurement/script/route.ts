export async function GET() {
  try {
    const response = await fetch('https://plausible.io/js/script.js', {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Tracker unavailable')
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
