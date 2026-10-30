'use client'

/**
 * The command line, as typed: a wrapping field so a long pipeline stays whole
 * on a phone. Enter explains; Shift+Enter is never needed because explain does
 * not model multi-line input. Without JavaScript the Explain button submits.
 */
export function ExplainInput({ initial, maxLength }: { initial: string; maxLength: number }) {
  return (
    <textarea
      name="cmd"
      defaultValue={initial}
      rows={1}
      maxLength={maxLength}
      required
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={!initial}
      placeholder="Paste a command line"
      aria-label="Command line to explain"
      data-bm-page-search
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      }}
      className="bm-field bm-xinput min-w-0 flex-1 resize-none pt-1 pb-2 font-mono text-md leading-[1.45] placeholder:font-serif placeholder:italic md:text-lg"
    />
  )
}
