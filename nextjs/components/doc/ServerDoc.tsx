import type { Distro } from '../../lib/distro'
import type { BlockNode } from '../../lib/docModel'
import { BlockView, blockKey } from './BlockView'

/** The AST stays on the server; only CodeBlock islands receive source text. */
export function ServerDoc({ blocks, distro }: { blocks: BlockNode[]; distro: Distro }) {
  return (
    <div className="space-y-5" data-bm-document>
      {blocks.map((block, index) => (
        <div key={blockKey(block, index)} className="-mx-4 px-4 sm:mx-0 sm:px-0" data-bm-block data-bm-block-index={index} data-bm-block-type={block.type}>
          <BlockView block={block} ctx={{}} distro={distro} />
        </div>
      ))}
    </div>
  )
}
