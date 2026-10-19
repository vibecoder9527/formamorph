// Ships the interface in Traditional Chinese (Taiwan).
//
// English stays in the source so the copy tests and the writing guide keep a single
// source of truth. Vite applies this map while serving and building. Vitest and
// Playwright set VITE_UI_LANG=en or VITEST, and then the source strings pass through
// unchanged. Keys are the source text with each line trimmed and runs of spaces
// collapsed; template holes are ${0}, ${1}, … in source order.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DICT_PATH = path.join(ROOT, 'src/i18n/zh-Hant-TW.json')

/** Strings that are program sentinels, not copy. Never rewrite them. */
const KEEP = new Set(['START GAME'])

const PROP_NAMES = new Set([
  'label', 'description', 'help', 'info', 'hint', 'tip', 'placeholder',
  'sentWhen', 'emptyIndicator', 'backLabel', 'stripLabel', 'title',
  'aria-label', 'ariaLabel', 'alt', 'message', 'empty', 'body', 'line',
  'confirmLabel', 'cancelLabel', 'subtitle', 'heading', 'caption',
  'tooltip', 'detail', 'ok', 'cancel', 'confirm', 'menuLabel',
  'faceTip', 'faceDescription', 'faceLabel', 'removeTitle',
  'save', 'saving', 'saved', 'failed',
])

const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'loading', 'warn'])

/** Same normalization the dictionary was built with. */
export function normText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function loadDict(file = DICT_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('locale file must be a JSON object')
    }
    return parsed
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    throw error
  }
}

export function uiLangEnabled() {
  if (process.env.VITEST) return false
  return process.env.VITE_UI_LANG !== 'en'
}

function skipFile(id) {
  const file = id.split('?')[0]
  if (!/\.(tsx|ts|jsx|js)$/.test(file)) return true
  if (file.includes('node_modules')) return true
  if (file.includes('.test.') || file.includes('.spec.')) return true
  if (file.includes('/defaultworlds/')) return true
  if (file.includes('/docs/')) return true
  if (file.includes('GamePrompts') || file.includes('ExperimentalPrompts')) return true
  if (/Prompt(s)?\.ts$/.test(file) && !file.endsWith('.tsx')) return true
  if (/(^|\/)dev[A-Z]/.test(file)) return true
  if (file.includes('revealTestScripts')) return true
  return false
}

function placeholders(text) {
  return [...text.matchAll(/\$\{(\d+)\}/g)].map((match) => match[1]).sort().join(',')
}

function propName(node, ts) {
  if (!node.name) return null
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text
  return null
}

function templatePattern(node) {
  let pattern = node.head.text
  for (const span of node.templateSpans) {
    pattern += '${' + node.templateSpans.indexOf(span) + '}'
    pattern += span.literal.text
  }
  return pattern
}

function escapeTemplateChunk(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function rebuildTemplate(node, translated) {
  const exprs = node.templateSpans.map((span) => span.expression.getText())
  const parts = translated.split(/\$\{(\d+)\}/)
  let out = '`'
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) out += escapeTemplateChunk(parts[i])
    else {
      const expr = exprs[Number(parts[i])]
      if (expr == null) return null
      out += '${' + expr + '}'
    }
  }
  return out + '`'
}

function jsxSafe(translated, raw) {
  // JSX text treats <, >, {, and & as syntax. Translations may quote tokens such as <NOTES>.
  const safe = translated
    .replace(/&/g, '&amp;')
    .replace(/[{<>]/g, (ch) => (ch === '{' ? "{'{'}" : ch === '<' ? '&lt;' : '&gt;'))
  const lead = /^\s/.test(raw) ? ' ' : ''
  const trail = /\s$/.test(raw) ? ' ' : ''
  return lead + safe + trail
}

/**
 * Rewrite UI string positions in one source file. Returns the original code when
 * nothing in the dictionary matches.
 *
 * @param {string} code
 * @param {string} filename
 * @param {Record<string, string>} dict
 * @param {typeof import('typescript')} ts
 */
export function translateSource(code, filename, dict, ts) {
  if (!dict || Object.keys(dict).length === 0) return code
  const kind = filename.endsWith('.tsx') || filename.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, kind)
  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = []

  const lookup = (text) => {
    const key = normText(text)
    if (!key || KEEP.has(key)) return null
    const hit = dict[key]
    if (typeof hit !== 'string' || hit === key) return null
    return hit
  }

  const consider = (expr) => {
    if (!expr) return
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      const hit = lookup(expr.text)
      if (!hit) return
      edits.push({ start: expr.getStart(sf), end: expr.getEnd(), text: JSON.stringify(hit) })
      return
    }
    if (ts.isTemplateExpression(expr)) {
      const pattern = templatePattern(expr)
      const hit = lookup(pattern)
      if (!hit || placeholders(normText(pattern)) !== placeholders(hit)) return
      const rebuilt = rebuildTemplate(expr, hit)
      if (!rebuilt) return
      edits.push({ start: expr.getStart(sf), end: expr.getEnd(), text: rebuilt })
    }
  }

  // Button faces often sit in a ternary or a ?? fallback. Rewrite those branches.
  // Leave the condition alone, so a comparison such as mode === 'Cancel' stays a sentinel.
  const considerRendered = (expr) => {
    if (!expr) return
    if (
      ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)
      || ts.isSatisfiesExpression(expr) || ts.isTypeAssertionExpression(expr)
      || ts.isNonNullExpression(expr)
    ) {
      considerRendered(expr.expression)
      return
    }
    if (ts.isConditionalExpression(expr)) {
      considerRendered(expr.whenTrue)
      considerRendered(expr.whenFalse)
      return
    }
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        considerRendered(expr.left)
        considerRendered(expr.right)
      }
      return
    }
    consider(expr)
  }

  const visit = (node, parentKind) => {
    if (ts.isJsxText(node)) {
      const raw = node.getText()
      const hit = lookup(raw)
      if (hit) edits.push({ start: node.getStart(sf), end: node.getEnd(), text: jsxSafe(hit, raw) })
    } else if (ts.isJsxAttribute(node) && node.initializer && PROP_NAMES.has(node.name.getText())) {
      if (ts.isStringLiteral(node.initializer)) considerRendered(node.initializer)
      else if (ts.isJsxExpression(node.initializer)) considerRendered(node.initializer.expression)
    } else if (ts.isPropertyAssignment(node) && PROP_NAMES.has(propName(node, ts) ?? '')) {
      considerRendered(node.initializer)
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression
      if (ts.isPropertyAccessExpression(expr) && TOAST_METHODS.has(expr.name.text)) {
        const recv = expr.expression.getText()
        if ((recv === 'toast' || recv.endsWith('.toast')) && node.arguments.length) considerRendered(node.arguments[0])
      }
    } else if (ts.isJsxExpression(node) && parentKind === 'jsx-child') {
      considerRendered(node.expression)
    }

    const childKind = ts.isJsxElement(node) || ts.isJsxFragment(node)
      ? 'jsx-child'
      : ts.isJsxAttribute(node) || ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
        ? 'jsx-attr-tree'
        : parentKind
    node.forEachChild((child) => visit(child, childKind))
  }

  visit(sf, null)
  if (edits.length === 0) return code
  edits.sort((a, b) => b.start - a.start)
  let out = code
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

export function zhTwPlugin() {
  const enabled = uiLangEnabled()
  let dict = null
  let tsMod = null
  return {
    name: 'zh-tw-ui',
    enforce: 'pre',
    async transform(code, id) {
      if (!enabled || skipFile(id)) return null
      dict ??= loadDict()
      if (Object.keys(dict).length === 0) return null
      tsMod ??= (await import('typescript')).default ?? (await import('typescript'))
      const next = translateSource(code, id.split('?')[0], dict, tsMod)
      if (next === code) return null
      return { code: next, map: null }
    },
  }
}
