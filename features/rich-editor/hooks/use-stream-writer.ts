import { type Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseStreamWriterOptions {
  editor: Editor | null
  onStreamStart?: () => void
  onStreamEnd?: () => void
}

// Simple blocks that can be safely previewed while incomplete
const SIMPLE_BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
// Complex blocks that must be complete before rendering
const COMPLEX_BLOCKS = ['ul', 'ol', 'blockquote', 'pre', 'table']

/**
 * Reliable streaming with selective preview:
 * - Simple blocks (p, h1-h6): Preview with auto-close as they stream
 * - Complex blocks (ul, ol, blockquote): Wait for complete, then insert
 */
export function useStreamWriter({
  editor,
  onStreamStart,
  onStreamEnd,
}: UseStreamWriterOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const accumulatedHtmlRef = useRef('')
  const lastRenderedHtmlRef = useRef('')
  const insertPosRef = useRef<number>(0)
  
  const rafIdRef = useRef<number | null>(null)

  const processContent = useCallback(() => {
    if (!editor) return
    
    const html = accumulatedHtmlRef.current
    if (!html || html === lastRenderedHtmlRef.current) return
    
    // Parse and split content into complete and incomplete parts
    const { completeBlocks, incompleteBlock } = parseHtml(html)
    
    // Build renderable content
    let renderHtml = completeBlocks.join('')
    
    // Only add incomplete block if it's a simple type
    if (incompleteBlock) {
      const tagMatch = incompleteBlock.match(/^<([a-zA-Z][a-zA-Z0-9]*)/)
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase()
        if (SIMPLE_BLOCKS.includes(tagName)) {
          // Safe to preview - auto-close it
          // Strip any incomplete nested tags first
          const cleanContent = incompleteBlock
            .replace(/<[a-zA-Z][^>]*$/, '') // Remove incomplete opening tag at end
            .replace(/<\/[a-zA-Z]*$/, '')   // Remove incomplete closing tag at end
          renderHtml += cleanContent + `</${tagName}>`
        }
        // For complex blocks, we just don't add them yet
      } else if (incompleteBlock.trim()) {
        // Plain text not in any block - wrap in p
        renderHtml += `<p>${incompleteBlock}</p>`
      }
    }
    
    if (!renderHtml || renderHtml === lastRenderedHtmlRef.current) return
    
    // Perform the update
    const docSize = editor.state.doc.content.size
    const startPos = insertPosRef.current
    const endPos = docSize > 1 ? docSize - 1 : docSize
    
    try {
      if (lastRenderedHtmlRef.current === '') {
        // First insertion
        editor.commands.insertContent(renderHtml, {
          parseOptions: { preserveWhitespace: false }
        })
      } else if (startPos < endPos) {
        // Update: delete old content and insert new
        editor.chain()
          .deleteRange({ from: startPos, to: endPos })
          .insertContentAt(startPos, renderHtml, {
            parseOptions: { preserveWhitespace: false }
          })
          .scrollIntoView()
          .run()
      }
      
      lastRenderedHtmlRef.current = renderHtml
    } catch (e) {
      // If there's an error, skip this frame
      console.warn('Stream render skipped:', e)
    }
  }, [editor])

  useEffect(() => {
    if (!isStreaming) return

    let lastTime = 0
    const THROTTLE_MS = 50

    const loop = (timestamp: number) => {
      if (timestamp - lastTime >= THROTTLE_MS) {
        processContent()
        lastTime = timestamp
      }
      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [isStreaming, processContent])

  const startStream = useCallback(
    async (options: { replaceSelection?: boolean } = {}) => {
      if (!editor) return

      setIsStreaming(true)
      onStreamStart?.()
      abortControllerRef.current = new AbortController()
      
      accumulatedHtmlRef.current = ''
      lastRenderedHtmlRef.current = ''
      
      editor.commands.focus()
      if (options.replaceSelection) {
        editor.chain().deleteSelection().run()
      }
      
      // Store the position where we start inserting
      insertPosRef.current = editor.state.selection.from
      
      editor.setEditable(false)
      
      return abortControllerRef.current.signal
    },
    [editor, onStreamStart]
  )

  const stopStream = useCallback(() => {
    if (!editor) return
    
    // Final render with complete accumulated HTML
    const html = accumulatedHtmlRef.current
    if (html) {
      try {
        const docSize = editor.state.doc.content.size
        const startPos = insertPosRef.current
        const endPos = docSize > 1 ? docSize - 1 : docSize
        
        if (lastRenderedHtmlRef.current !== '' && startPos < endPos) {
          editor.chain()
            .deleteRange({ from: startPos, to: endPos })
            .insertContentAt(startPos, html, {
              parseOptions: { preserveWhitespace: false }
            })
            .run()
        } else {
          editor.commands.insertContent(html, {
            parseOptions: { preserveWhitespace: false }
          })
        }
      } catch (e) {
        console.error('Final stream render error:', e)
      }
    }
    
    accumulatedHtmlRef.current = ''
    lastRenderedHtmlRef.current = ''
    insertPosRef.current = 0

    setIsStreaming(false)
    editor.setEditable(true)
    onStreamEnd?.()
    abortControllerRef.current = null
    
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
  }, [editor, onStreamEnd])

  const writeChunk = useCallback(
    (chunk: string) => {
      if (!editor || !isStreaming) return
      accumulatedHtmlRef.current += chunk
    },
    [editor, isStreaming]
  )
  
  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    stopStream()
  }, [stopStream])

  return {
    isStreaming,
    startStream,
    writeChunk,
    stopStream,
    abort
  }
}

/**
 * Parse HTML and split into complete blocks and incomplete trailing content
 */
function parseHtml(html: string): { 
  completeBlocks: string[]
  incompleteBlock: string | null 
} {
  const completeBlocks: string[] = []
  let remaining = html
  
  // All block-level tags we care about
  const allBlocks = [...SIMPLE_BLOCKS, ...COMPLEX_BLOCKS]
  
  while (remaining.length > 0) {
    // Try to find a complete block
    let foundComplete = false
    
    for (const tag of allBlocks) {
      // Check if remaining starts with this tag
      const openPattern = new RegExp(`^<${tag}(?:\\s[^>]*)?>`, 'i')
      const openMatch = remaining.match(openPattern)
      
      if (openMatch) {
        // Find the matching close tag (handling nesting)
        const closeIndex = findMatchingClose(remaining, tag)
        
        if (closeIndex !== -1) {
          // Found complete block
          const completeBlock = remaining.slice(0, closeIndex)
          completeBlocks.push(completeBlock)
          remaining = remaining.slice(closeIndex)
          foundComplete = true
          break
        }
      }
    }
    
    if (!foundComplete) {
      // No complete block found - rest is incomplete
      break
    }
  }
  
  return {
    completeBlocks,
    incompleteBlock: remaining.length > 0 ? remaining : null
  }
}

/**
 * Find the index of the end of a complete block (including closing tag)
 * Handles nested tags of the same type
 */
function findMatchingClose(html: string, tagName: string): number {
  const openPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')
  const closePattern = new RegExp(`</${tagName}>`, 'gi')
  
  let depth = 0
  let pos = 0
  
  while (pos < html.length) {
    // Find next open or close tag
    openPattern.lastIndex = pos
    closePattern.lastIndex = pos
    
    const openMatch = openPattern.exec(html)
    const closeMatch = closePattern.exec(html)
    
    if (!openMatch && !closeMatch) {
      // No more tags found
      return -1
    }
    
    const openPos = openMatch ? openMatch.index : Infinity
    const closePos = closeMatch ? closeMatch.index : Infinity
    
    if (openPos < closePos) {
      // Opening tag comes first
      depth++
      pos = openPos + openMatch![0].length
    } else {
      // Closing tag comes first
      depth--
      pos = closePos + closeMatch![0].length
      
      if (depth === 0) {
        // Found the matching close
        return pos
      }
    }
  }
  
  return -1
}
