/**
 * The man page's one inline script. The CDN caches man pages without reading
 * cookies, so the reader's theme, reading preferences and default distro reach
 * first paint from here instead of from the server. It sets attributes on
 * <html>, the only element that exists while <head> runs, and mirrors the stored
 * distro into the cookie the proxy reads for bare URLs.
 *
 * The CSP allows it by hash, so it is a fixed string: any edit changes the
 * hash, which `manBootScriptHash()` recomputes from these exact bytes.
 */
export const MAN_BOOT_SCRIPT =
  '(function(){var d=document.documentElement,s;try{s=window.localStorage}catch(e){}' +
  'function g(k){try{return s?s.getItem(k):null}catch(e){return null}}' +
  'function c(k){var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));if(!m)return null;try{return decodeURIComponent(m[1])}catch(e){return null}}' +
  'var t=g("bm-theme")||c("bm-theme");' +
  'if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}' +
  'd.setAttribute("data-theme",t);' +
  'var p=null;try{p=JSON.parse(g("bm-reading-prefs")||c("bm-reading-prefs")||"null")}catch(e){}' +
  'var a={fontSize:["font-size","small medium large xlarge"],fontFamily:["font-family","serif sans mono"],lineHeight:["line-height","compact normal relaxed"],columnWidth:["column-width","narrow normal wide"],codeTheme:["code-theme","light dark auto"]};' +
  'if(p&&p.version===1){for(var k in a){var v=p[k];if(typeof v==="string"&&(" "+a[k][1]+" ").indexOf(" "+v+" ")>=0)d.setAttribute("data-bm-"+a[k][0],v)}}' +
  'var r=g("bm-distro");' +
  'if(r&&/^(debian|ubuntu|fedora|arch|alpine|freebsd|macos)$/.test(r)&&c("bm-distro")!==r){document.cookie="bm-distro="+r+"; Path=/; Max-Age=31536000; SameSite=Lax"}' +
  '})()'

let hashPromise: Promise<string> | null = null

/** The CSP source for MAN_BOOT_SCRIPT: `'sha256-<base64>'`. */
export function manBootScriptHash(): Promise<string> {
  hashPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(MAN_BOOT_SCRIPT)).then((digest) => {
    let binary = ''
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
    return `'sha256-${btoa(binary)}'`
  })
  return hashPromise
}
