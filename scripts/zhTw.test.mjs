import { createRequire } from 'node:module'
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

const out = translateSource(source, 'View.tsx', dict, ts)

const expectIn = (text) => {
  if (!out.includes(text)) {
    console.error(out)
    throw new Error('missing: ' + text)
  }
}
const expectNot = (text) => {
  if (out.includes(text)) {
    console.error(out)
    throw new Error('unexpected: ' + text)
  }
}

expectIn("label: \"取消\"")
expectIn("description: \"停止這個行動\"")
expectIn('const keep = \'Cancel\'')
expectIn('action: "START GAME"')
expectIn('save: "儲存"')
expectIn('saving: "儲存中…"')
expectIn("const logic = mode === 'Cancel' ? 'Close' : 'Save'")
expectIn('aria-label="關閉"')
expectIn('>儲存<')
expectIn('busy ? "關閉" : "取消"')
expectIn('mode === \'Cancel\' ? "關閉" : "儲存"')
expectIn('瀏覽器不允許這樣做。')
expectIn('`要刪除${name}嗎？`')
expectNot('>Save<')
expectNot("label: 'Cancel'")

if (normText('  a \n  b  ') !== 'a\nb') throw new Error('normText')

const parsed = ts.createSourceFile('out.tsx', out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const diagnostics = parsed.parseDiagnostics ?? []
if (diagnostics.length) throw new Error(diagnostics.map((d) => d.messageText).join('\n'))

console.log('zhTw ok')
