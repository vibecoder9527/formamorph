// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { translateSource, normText } from './zhTw.mjs'

const ts = createRequire(import.meta.url)('typescript')

const dict = {
  Cancel: '取消',
  'Stops the action': '停止這個行動',
  Close: '關閉',
  Save: '儲存',
  'Delete ${0}?': '要刪除${0}嗎？',
  'Browsers don&apos;t let this.': '瀏覽器不允許這樣做。',
  'START GAME': '不該被換掉',
  'Saving…': '儲存中…',
}

const source = `
const SETTINGS = { label: 'Cancel', description: 'Stops the action' }
const keep = 'Cancel'
const sentinel = { action: "START GAME" }
const faces = { save: 'Save', saving: 'Saving…' }
const logic = mode === 'Cancel' ? 'Close' : 'Save'
export function View({ name, mode, busy }) {
  return (
    <section>
      <button aria-label="Close" onClick={keep}>Save</button>
      <button>{busy ? 'Close' : 'Cancel'}</button>
      <span>{mode === 'Cancel' ? 'Close' : 'Save'}</span>
      <p>
        Browsers don&apos;t let this.
      </p>
      <span>{\`Delete \${name}?\`}</span>
    </section>
  )
}
`

describe('zh-Hant-TW UI rewrite', () => {
  const out = translateSource(source, 'View.tsx', dict, ts)

  it('rewrites UI copy and leaves sentinels in place', () => {
    expect(out).toContain('label: "取消"')
    expect(out).toContain('description: "停止這個行動"')
    expect(out).toContain("const keep = 'Cancel'")
    expect(out).toContain('action: "START GAME"')
    expect(out).toContain('save: "儲存"')
    expect(out).toContain('saving: "儲存中…"')
    expect(out).toContain("const logic = mode === 'Cancel' ? 'Close' : 'Save'")
    expect(out).toContain('aria-label="關閉"')
    expect(out).toContain('>儲存<')
    expect(out).toContain('busy ? "關閉" : "取消"')
    expect(out).toContain('mode === \'Cancel\' ? "關閉" : "儲存"')
    expect(out).toContain('瀏覽器不允許這樣做。')
    expect(out).toContain('`要刪除${name}嗎？`')
    expect(out).not.toContain('>Save<')
    expect(out).not.toContain("label: 'Cancel'")
    expect(normText('  a \n  b  ')).toBe('a\nb')
    const parsed = ts.createSourceFile('out.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    expect(parsed.parseDiagnostics ?? []).toEqual([])
  })
})
