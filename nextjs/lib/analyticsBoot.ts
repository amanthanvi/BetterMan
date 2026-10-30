// Fixed bytes: cached Pages Router HTML authorizes this bootstrap by its CSP hash.
export const ANALYTICS_BOOT_SCRIPT =
  'window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};' +
  'window.va("beforeSend",function(e){try{' +
  'var u=new URL(e.url,window.location.origin),q=new URLSearchParams();' +
  'u.searchParams.forEach(function(v,k){if(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","ref","source"].indexOf(k)!==-1)q.append(k,v)});' +
  'e.url=u.pathname+(q.size?"?"+q.toString():"");return e' +
  '}catch(_){return null}});'

let hashPromise: Promise<string> | undefined

export function analyticsBootScriptHash(): Promise<string> {
  hashPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(ANALYTICS_BOOT_SCRIPT)).then((digest) => {
    let binary = ''
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
    return `'sha256-${btoa(binary)}'`
  })
  return hashPromise
}
