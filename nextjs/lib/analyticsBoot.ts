// Fixed bytes: cached Pages Router HTML authorizes this bootstrap by its CSP hash.
export const ANALYTICS_BOOT_SCRIPT =
  '(function(){var c=document.currentScript,d=c.dataset,q=window.vaq||[];window.vaq=[];' +
  'window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};' +
  'window.va("beforeSend",function(e){try{' +
  'var u=new URL(e.url,window.location.origin),q=new URLSearchParams();' +
  'u.searchParams.forEach(function(v,k){if(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","ref","source"].indexOf(k)!==-1)q.append(k,v)});' +
  'q=q.toString();e.url=u.origin+u.pathname+(q?"?"+q:"");return e' +
  '}catch(_){return null}});' +
  // The hook must precede interactions already queued before this bootstrap.
  'window.vaq.push.apply(window.vaq,q);' +
  'var s=document.createElement("script");s.src=d.scriptSrc;s.defer=true;if(c.nonce)s.nonce=c.nonce;' +
  'if(d.eventEndpoint)s.dataset.eventEndpoint=d.eventEndpoint;if(d.viewEndpoint)s.dataset.viewEndpoint=d.viewEndpoint;' +
  'document.head.appendChild(s)})();'

let hashPromise: Promise<string> | undefined

export function analyticsBootScriptHash(): Promise<string> {
  hashPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(ANALYTICS_BOOT_SCRIPT)).then((digest) => {
    let binary = ''
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
    return `'sha256-${btoa(binary)}'`
  })
  return hashPromise
}
