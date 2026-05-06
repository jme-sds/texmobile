import type { MutableRefObject } from 'react'
import type { CompletionContext, CompletionResult, Completion, CompletionSource } from '@codemirror/autocomplete'
import { completionStatus, snippet } from '@codemirror/autocomplete'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

// Converts string apply fields that contain {} into snippet apply functions
// so the cursor lands inside the first pair of braces after acceptance.
function withSnippets(completions: Completion[]): Completion[] {
  return completions.map(c => {
    if (typeof c.apply === 'string' && c.apply.includes('{}')) {
      return { ...c, apply: snippet(c.apply.replace('{}', '{#{}}')) }
    }
    return c
  })
}

// ── Static completion data ────────────────────────────────────────────────────

export const LATEX_COMMANDS: Completion[] = [
  // Document structure
  { label: '\\documentclass', type: 'keyword', detail: 'document class' },
  { label: '\\usepackage', type: 'keyword', detail: 'load package', apply: '\\usepackage{}' },
  { label: '\\begin', type: 'keyword', detail: 'begin environment', apply: '\\begin{}' },
  { label: '\\end', type: 'keyword', detail: 'end environment', apply: '\\end{}' },
  { label: '\\part', type: 'keyword', detail: 'top-level division' },
  { label: '\\chapter', type: 'keyword', detail: 'chapter heading' },
  { label: '\\section', type: 'keyword', detail: 'section', apply: '\\section{}' },
  { label: '\\subsection', type: 'keyword', detail: 'subsection', apply: '\\subsection{}' },
  { label: '\\subsubsection', type: 'keyword', detail: 'subsubsection', apply: '\\subsubsection{}' },
  { label: '\\paragraph', type: 'keyword', apply: '\\paragraph{}' },
  { label: '\\subparagraph', type: 'keyword', apply: '\\subparagraph{}' },
  { label: '\\appendix', type: 'keyword' },
  { label: '\\tableofcontents', type: 'keyword' },
  { label: '\\listoffigures', type: 'keyword' },
  { label: '\\listoftables', type: 'keyword' },
  { label: '\\maketitle', type: 'keyword' },
  { label: '\\title', type: 'keyword', apply: '\\title{}' },
  { label: '\\author', type: 'keyword', apply: '\\author{}' },
  { label: '\\date', type: 'keyword', apply: '\\date{}' },
  { label: '\\abstract', type: 'keyword', apply: '\\abstract{}' },
  { label: '\\input', type: 'keyword', apply: '\\input{}' },
  { label: '\\include', type: 'keyword', apply: '\\include{}' },
  { label: '\\newcommand', type: 'keyword', detail: 'define command', apply: '\\newcommand{}{}' },
  { label: '\\renewcommand', type: 'keyword', apply: '\\renewcommand{}{}' },
  { label: '\\newenvironment', type: 'keyword', apply: '\\newenvironment{}{}{}' },

  // Math operators / functions
  { label: '\\frac', type: 'function', detail: 'fraction', apply: '\\frac{}{}' },
  { label: '\\dfrac', type: 'function', detail: 'display fraction', apply: '\\dfrac{}{}' },
  { label: '\\tfrac', type: 'function', detail: 'text fraction', apply: '\\tfrac{}{}' },
  { label: '\\sqrt', type: 'function', detail: 'square root', apply: '\\sqrt{}' },
  { label: '\\sum', type: 'function', detail: 'summation', apply: '\\sum_{i=1}^{n}' },
  { label: '\\prod', type: 'function', detail: 'product', apply: '\\prod_{i=1}^{n}' },
  { label: '\\int', type: 'function', detail: 'integral', apply: '\\int_{a}^{b}' },
  { label: '\\iint', type: 'function', detail: 'double integral' },
  { label: '\\iiint', type: 'function', detail: 'triple integral' },
  { label: '\\oint', type: 'function', detail: 'contour integral' },
  { label: '\\lim', type: 'function', detail: 'limit', apply: '\\lim_{x \\to }' },
  { label: '\\limsup', type: 'function' },
  { label: '\\liminf', type: 'function' },
  { label: '\\sup', type: 'function' },
  { label: '\\inf', type: 'function' },
  { label: '\\max', type: 'function' },
  { label: '\\min', type: 'function' },
  { label: '\\log', type: 'function' },
  { label: '\\ln', type: 'function' },
  { label: '\\exp', type: 'function' },
  { label: '\\sin', type: 'function' },
  { label: '\\cos', type: 'function' },
  { label: '\\tan', type: 'function' },
  { label: '\\arcsin', type: 'function' },
  { label: '\\arccos', type: 'function' },
  { label: '\\arctan', type: 'function' },
  { label: '\\sinh', type: 'function' },
  { label: '\\cosh', type: 'function' },
  { label: '\\tanh', type: 'function' },
  { label: '\\det', type: 'function' },
  { label: '\\dim', type: 'function' },
  { label: '\\ker', type: 'function' },
  { label: '\\text', type: 'function', detail: 'text in math', apply: '\\text{}' },
  { label: '\\binom', type: 'function', detail: 'binomial', apply: '\\binom{}{}' },
  { label: '\\left', type: 'keyword', detail: 'auto-size left delimiter' },
  { label: '\\right', type: 'keyword', detail: 'auto-size right delimiter' },

  // Math symbols — arrows / logic / sets
  { label: '\\infty', type: 'constant', detail: '∞' },
  { label: '\\partial', type: 'constant', detail: '∂' },
  { label: '\\nabla', type: 'constant', detail: '∇' },
  { label: '\\cdot', type: 'constant', detail: '·' },
  { label: '\\cdots', type: 'constant', detail: '⋯' },
  { label: '\\ldots', type: 'constant', detail: '…' },
  { label: '\\vdots', type: 'constant', detail: '⋮' },
  { label: '\\ddots', type: 'constant', detail: '⋱' },
  { label: '\\times', type: 'constant', detail: '×' },
  { label: '\\div', type: 'constant', detail: '÷' },
  { label: '\\pm', type: 'constant', detail: '±' },
  { label: '\\mp', type: 'constant', detail: '∓' },
  { label: '\\leq', type: 'constant', detail: '≤' },
  { label: '\\geq', type: 'constant', detail: '≥' },
  { label: '\\neq', type: 'constant', detail: '≠' },
  { label: '\\approx', type: 'constant', detail: '≈' },
  { label: '\\equiv', type: 'constant', detail: '≡' },
  { label: '\\sim', type: 'constant', detail: '~' },
  { label: '\\simeq', type: 'constant', detail: '≃' },
  { label: '\\propto', type: 'constant', detail: '∝' },
  { label: '\\in', type: 'constant', detail: '∈' },
  { label: '\\notin', type: 'constant', detail: '∉' },
  { label: '\\subset', type: 'constant', detail: '⊂' },
  { label: '\\subseteq', type: 'constant', detail: '⊆' },
  { label: '\\supset', type: 'constant', detail: '⊃' },
  { label: '\\supseteq', type: 'constant', detail: '⊇' },
  { label: '\\cup', type: 'constant', detail: '∪' },
  { label: '\\cap', type: 'constant', detail: '∩' },
  { label: '\\emptyset', type: 'constant', detail: '∅' },
  { label: '\\forall', type: 'constant', detail: '∀' },
  { label: '\\exists', type: 'constant', detail: '∃' },
  { label: '\\nexists', type: 'constant', detail: '∄' },
  { label: '\\neg', type: 'constant', detail: '¬' },
  { label: '\\wedge', type: 'constant', detail: '∧' },
  { label: '\\vee', type: 'constant', detail: '∨' },
  { label: '\\oplus', type: 'constant', detail: '⊕' },
  { label: '\\otimes', type: 'constant', detail: '⊗' },
  { label: '\\to', type: 'constant', detail: '→' },
  { label: '\\leftarrow', type: 'constant', detail: '←' },
  { label: '\\rightarrow', type: 'constant', detail: '→' },
  { label: '\\Leftarrow', type: 'constant', detail: '⇐' },
  { label: '\\Rightarrow', type: 'constant', detail: '⇒' },
  { label: '\\leftrightarrow', type: 'constant', detail: '↔' },
  { label: '\\Leftrightarrow', type: 'constant', detail: '⇔' },
  { label: '\\mapsto', type: 'constant', detail: '↦' },
  { label: '\\uparrow', type: 'constant', detail: '↑' },
  { label: '\\downarrow', type: 'constant', detail: '↓' },
  { label: '\\iff', type: 'constant', detail: '⟺' },
  { label: '\\implies', type: 'constant', detail: '⟹' },

  // Math font commands
  { label: '\\mathbb', type: 'function', apply: '\\mathbb{}' },
  { label: '\\mathbf', type: 'function', apply: '\\mathbf{}' },
  { label: '\\mathcal', type: 'function', apply: '\\mathcal{}' },
  { label: '\\mathit', type: 'function', apply: '\\mathit{}' },
  { label: '\\mathrm', type: 'function', apply: '\\mathrm{}' },
  { label: '\\mathsf', type: 'function', apply: '\\mathsf{}' },
  { label: '\\mathtt', type: 'function', apply: '\\mathtt{}' },
  { label: '\\mathfrak', type: 'function', apply: '\\mathfrak{}' },

  // Math accents
  { label: '\\overline', type: 'function', apply: '\\overline{}' },
  { label: '\\underline', type: 'function', apply: '\\underline{}' },
  { label: '\\overbrace', type: 'function', apply: '\\overbrace{}' },
  { label: '\\underbrace', type: 'function', apply: '\\underbrace{}' },
  { label: '\\hat', type: 'function', apply: '\\hat{}' },
  { label: '\\tilde', type: 'function', apply: '\\tilde{}' },
  { label: '\\vec', type: 'function', apply: '\\vec{}' },
  { label: '\\bar', type: 'function', apply: '\\bar{}' },
  { label: '\\dot', type: 'function', apply: '\\dot{}' },
  { label: '\\ddot', type: 'function', apply: '\\ddot{}' },
  { label: '\\acute', type: 'function', apply: '\\acute{}' },
  { label: '\\grave', type: 'function', apply: '\\grave{}' },
  { label: '\\check', type: 'function', apply: '\\check{}' },
  { label: '\\widehat', type: 'function', apply: '\\widehat{}' },
  { label: '\\widetilde', type: 'function', apply: '\\widetilde{}' },

  // Greek letters — lowercase
  { label: '\\alpha', type: 'constant', detail: 'α' },
  { label: '\\beta', type: 'constant', detail: 'β' },
  { label: '\\gamma', type: 'constant', detail: 'γ' },
  { label: '\\delta', type: 'constant', detail: 'δ' },
  { label: '\\epsilon', type: 'constant', detail: 'ε' },
  { label: '\\varepsilon', type: 'constant', detail: 'ε (variant)' },
  { label: '\\zeta', type: 'constant', detail: 'ζ' },
  { label: '\\eta', type: 'constant', detail: 'η' },
  { label: '\\theta', type: 'constant', detail: 'θ' },
  { label: '\\vartheta', type: 'constant', detail: 'ϑ' },
  { label: '\\iota', type: 'constant', detail: 'ι' },
  { label: '\\kappa', type: 'constant', detail: 'κ' },
  { label: '\\lambda', type: 'constant', detail: 'λ' },
  { label: '\\mu', type: 'constant', detail: 'μ' },
  { label: '\\nu', type: 'constant', detail: 'ν' },
  { label: '\\xi', type: 'constant', detail: 'ξ' },
  { label: '\\pi', type: 'constant', detail: 'π' },
  { label: '\\varpi', type: 'constant', detail: 'ϖ' },
  { label: '\\rho', type: 'constant', detail: 'ρ' },
  { label: '\\varrho', type: 'constant', detail: 'ϱ' },
  { label: '\\sigma', type: 'constant', detail: 'σ' },
  { label: '\\varsigma', type: 'constant', detail: 'ς' },
  { label: '\\tau', type: 'constant', detail: 'τ' },
  { label: '\\upsilon', type: 'constant', detail: 'υ' },
  { label: '\\phi', type: 'constant', detail: 'φ' },
  { label: '\\varphi', type: 'constant', detail: 'ϕ' },
  { label: '\\chi', type: 'constant', detail: 'χ' },
  { label: '\\psi', type: 'constant', detail: 'ψ' },
  { label: '\\omega', type: 'constant', detail: 'ω' },

  // Greek letters — uppercase
  { label: '\\Gamma', type: 'constant', detail: 'Γ' },
  { label: '\\Delta', type: 'constant', detail: 'Δ' },
  { label: '\\Theta', type: 'constant', detail: 'Θ' },
  { label: '\\Lambda', type: 'constant', detail: 'Λ' },
  { label: '\\Xi', type: 'constant', detail: 'Ξ' },
  { label: '\\Pi', type: 'constant', detail: 'Π' },
  { label: '\\Sigma', type: 'constant', detail: 'Σ' },
  { label: '\\Upsilon', type: 'constant', detail: 'Υ' },
  { label: '\\Phi', type: 'constant', detail: 'Φ' },
  { label: '\\Psi', type: 'constant', detail: 'Ψ' },
  { label: '\\Omega', type: 'constant', detail: 'Ω' },

  // Text formatting
  { label: '\\textbf', type: 'function', detail: 'bold', apply: '\\textbf{}' },
  { label: '\\textit', type: 'function', detail: 'italic', apply: '\\textit{}' },
  { label: '\\emph', type: 'function', detail: 'emphasize', apply: '\\emph{}' },
  { label: '\\texttt', type: 'function', detail: 'typewriter', apply: '\\texttt{}' },
  { label: '\\textrm', type: 'function', detail: 'roman', apply: '\\textrm{}' },
  { label: '\\textsf', type: 'function', detail: 'sans-serif', apply: '\\textsf{}' },
  { label: '\\textsc', type: 'function', detail: 'small caps', apply: '\\textsc{}' },
  { label: '\\textup', type: 'function', apply: '\\textup{}' },
  { label: '\\footnote', type: 'function', apply: '\\footnote{}' },
  { label: '\\centering', type: 'keyword' },
  { label: '\\raggedright', type: 'keyword' },
  { label: '\\raggedleft', type: 'keyword' },
  { label: '\\newline', type: 'keyword' },
  { label: '\\newpage', type: 'keyword' },
  { label: '\\clearpage', type: 'keyword' },
  { label: '\\cleardoublepage', type: 'keyword' },
  { label: '\\noindent', type: 'keyword' },
  { label: '\\indent', type: 'keyword' },
  { label: '\\hspace', type: 'function', apply: '\\hspace{}' },
  { label: '\\vspace', type: 'function', apply: '\\vspace{}' },
  { label: '\\hfill', type: 'keyword' },
  { label: '\\vfill', type: 'keyword' },
  { label: '\\linebreak', type: 'keyword' },
  { label: '\\pagebreak', type: 'keyword' },

  // References and cross-referencing
  { label: '\\label', type: 'function', apply: '\\label{}' },
  { label: '\\ref', type: 'function', apply: '\\ref{}' },
  { label: '\\eqref', type: 'function', apply: '\\eqref{}' },
  { label: '\\pageref', type: 'function', apply: '\\pageref{}' },
  { label: '\\cite', type: 'function', apply: '\\cite{}' },
  { label: '\\citep', type: 'function', detail: 'parenthetical', apply: '\\citep{}' },
  { label: '\\citet', type: 'function', detail: 'textual', apply: '\\citet{}' },
  { label: '\\citeauthor', type: 'function', apply: '\\citeauthor{}' },
  { label: '\\citeyear', type: 'function', apply: '\\citeyear{}' },
  { label: '\\bibliography', type: 'keyword', apply: '\\bibliography{}' },
  { label: '\\bibliographystyle', type: 'keyword', apply: '\\bibliographystyle{}' },

  // Floats, captions, graphics
  { label: '\\caption', type: 'function', apply: '\\caption{}' },
  { label: '\\includegraphics', type: 'function', apply: '\\includegraphics{}' },
  { label: '\\graphicspath', type: 'keyword', apply: '\\graphicspath{{}}' },

  // Lists
  { label: '\\item', type: 'keyword' },

  // Theorems (amsthm)
  { label: '\\newtheorem', type: 'keyword', apply: '\\newtheorem{}{}' },
  { label: '\\theoremstyle', type: 'keyword', apply: '\\theoremstyle{}' },
  { label: '\\qed', type: 'keyword' },
  { label: '\\qedhere', type: 'keyword' },
  { label: '\\proof', type: 'keyword' },

  // Colors (xcolor)
  { label: '\\textcolor', type: 'function', apply: '\\textcolor{}{}' },
  { label: '\\colorbox', type: 'function', apply: '\\colorbox{}{}' },
  { label: '\\color', type: 'function', apply: '\\color{}' },

  // Spacing
  { label: '\\quad', type: 'constant', detail: 'wide space' },
  { label: '\\qquad', type: 'constant', detail: 'very wide space' },
  { label: '\\,', type: 'constant', detail: 'thin space' },
  { label: '\\;', type: 'constant', detail: 'thick space' },
]

export const ENVIRONMENTS: Completion[] = [
  'equation', 'equation*',
  'align', 'align*',
  'gather', 'gather*',
  'multline', 'multline*',
  'split', 'cases',
  'figure', 'figure*',
  'table', 'table*',
  'tabular', 'tabularx', 'longtable',
  'enumerate', 'itemize', 'description',
  'abstract', 'verbatim', 'verbatim*',
  'lstlisting',
  'theorem', 'lemma', 'proof', 'definition',
  'corollary', 'remark', 'example', 'proposition',
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix',
  'document', 'titlepage',
  'minipage', 'center', 'flushleft', 'flushright',
  'quote', 'quotation', 'verse',
  'algorithm', 'algorithmic',
  'tikzpicture', 'scope',
  'array',
].map(name => ({ label: name, type: 'type' as const }))

export const PACKAGES: Completion[] = [
  'amsmath', 'amssymb', 'amsthm', 'amsfonts',
  'graphicx', 'graphics',
  'geometry',
  'hyperref',
  'xcolor', 'color',
  'booktabs', 'longtable', 'multirow', 'array', 'tabularx',
  'listings', 'minted', 'fancyvrb',
  'natbib', 'biblatex',
  'tikz', 'pgfplots', 'pgf',
  'fontenc', 'inputenc', 'babel', 'polyglossia',
  'microtype',
  'setspace', 'parskip', 'geometry',
  'enumitem',
  'caption', 'subcaption', 'float', 'wrapfig',
  'algorithm', 'algorithmicx', 'algpseudocode',
  'cleveref', 'varioref', 'autoref',
  'siunitx',
  'todonotes', 'lipsum',
  'xspace', 'xparse',
  'mathtools',
  'tcolorbox',
  'fancyhdr',
  'titlesec',
  'appendix',
].map(name => ({ label: name, type: 'namespace' as const }))

// ── Completion sources ────────────────────────────────────────────────────────

let snippetCommands: Completion[] | null = null

export function latexCommandSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\\[a-zA-Z]*/)
  if (!match) return null
  // Don't pop up immediately on a lone backslash unless the user explicitly triggered
  if (match.from === match.to - 1 && !context.explicit) return null
  if (!snippetCommands) snippetCommands = withSnippets(LATEX_COMMANDS)
  return {
    from: match.from,
    options: snippetCommands,
    validFor: /^\\[a-zA-Z]*$/,
  }
}

export function environmentSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)
  const match = textBefore.match(/\\(?:begin|end)\{([a-zA-Z*]*)$/)
  if (!match) return null
  const wordStart = context.pos - match[1].length
  return {
    from: wordStart,
    options: ENVIRONMENTS,
    validFor: /^[a-zA-Z*]*$/,
  }
}

export function packageSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)
  const match = textBefore.match(/\\usepackage(?:\[[^\]]*\])?\{([a-zA-Z, -]*)$/)
  if (!match) return null
  const lastComma = match[1].lastIndexOf(',')
  const fromOffset = lastComma >= 0 ? match[1].length - lastComma - 1 : match[1].length
  // Trim leading spaces from current token
  const tokenText = lastComma >= 0 ? match[1].slice(lastComma + 1) : match[1]
  const leadingSpaces = tokenText.length - tokenText.trimStart().length
  const wordStart = context.pos - (fromOffset - leadingSpaces)
  return {
    from: wordStart,
    options: PACKAGES,
    validFor: /^[a-zA-Z-]*$/,
  }
}

export function makeCitationSource(citationsRef: MutableRefObject<string[]>): CompletionSource {
  return function citationSource(context: CompletionContext): CompletionResult | null {
    const line = context.state.doc.lineAt(context.pos)
    const textBefore = line.text.slice(0, context.pos - line.from)
    const match = textBefore.match(/\\cite[a-zA-Z]*\*?\{([^}]*)$/)
    if (!match) return null
    const keys = citationsRef.current
    if (keys.length === 0) return null
    const lastComma = match[1].lastIndexOf(',')
    const tokenLen = lastComma >= 0 ? match[1].length - lastComma - 1 : match[1].length
    const wordStart = context.pos - tokenLen
    return {
      from: wordStart,
      options: keys.map(key => ({ label: key, type: 'variable' as const, detail: 'citation key' })),
      validFor: /^[a-zA-Z0-9_:.-]*$/,
    }
  }
}

export function labelRefSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)
  const match = textBefore.match(/\\(?:ref|eqref|pageref|cref|Cref|autoref)\{([^}]*)$/)
  if (!match) return null
  const wordStart = context.pos - match[1].length
  const doc = context.state.doc.toString()
  const labelRe = /\\label\{([^}]+)\}/g
  const labels: Completion[] = []
  let m: RegExpExecArray | null
  while ((m = labelRe.exec(doc)) !== null) {
    labels.push({ label: m[1], type: 'variable', detail: 'label' })
  }
  if (labels.length === 0) return null
  return {
    from: wordStart,
    options: labels,
    validFor: /^[a-zA-Z0-9_:.-]*$/,
  }
}

// ── .bib key parser ───────────────────────────────────────────────────────────

export function parseBibKeys(bibContent: string): string[] {
  const re = /@\w+\s*\{\s*([^,\s}]+)/g
  const keys: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(bibContent)) !== null) {
    keys.push(m[1])
  }
  return keys
}

// ── Scroll-fix plugin for above-cursor dropdown ───────────────────────────────
// When the completion list is rendered above the cursor with column-reverse CSS,
// the overflow scroll starts at the top (worst matches). This plugin scrolls to
// the bottom on every list update so the best match stays closest to the cursor.
export const completionScrollFixPlugin = ViewPlugin.fromClass(class {
  private scheduled = false

  update(update: ViewUpdate) {
    if (!update.docChanged && !update.selectionSet) return
    if (completionStatus(update.state) === null) { this.scheduled = false; return }
    if (this.scheduled) return
    this.scheduled = true
    requestAnimationFrame(() => {
      this.scheduled = false
      // Tooltip may be inside view.dom (CM ≥ 6.26) or appended to document.body.
      const ul = (
        update.view.dom.querySelector('.cm-tooltip-autocomplete ul') ??
        document.querySelector('.cm-tooltip-autocomplete ul')
      ) as HTMLElement | null
      if (ul) ul.scrollTop = ul.scrollHeight
    })
  }
})
