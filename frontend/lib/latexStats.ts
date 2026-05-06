export interface DocStats {
  charsWithSpaces: number
  charsWithoutSpaces: number
  words: number
  sentences: number
  paragraphs: number
  avgWordsPerSentence: number
  avgWordsPerParagraph: number
  syllables: number
  fleschReadingEase: number
  fleschKincaidGradeLevel: number
  readingTimeMinutes: number
}

// Commands whose entire argument should be discarded (not prose)
const DISCARD_ARG_CMDS = /^\\(label|ref|eqref|cite|citet|citep|citealt|pageref|vspace|hspace|vspace\*|hspace\*|includegraphics|input|include|bibliography|bibliographystyle|usepackage|documentclass|newcommand|renewcommand|setlength|setcounter|pagenumbering|pagestyle|thispagestyle|fontsize|selectfont|color|textcolor|colorbox|fboxsep|fboxrule|footnotesize|scriptsize|tiny|small|large|Large|LARGE|huge|Huge|normalsize)$/

function stripLatex(raw: string): string {
  // 1. Remove preamble (everything up to and including \begin{document})
  const docStart = raw.indexOf('\\begin{document}')
  let text = docStart >= 0 ? raw.slice(docStart + '\\begin{document}'.length) : raw

  // 2. Remove \end{document} and everything after
  const docEnd = text.indexOf('\\end{document}')
  if (docEnd >= 0) text = text.slice(0, docEnd)

  // 3. Strip % comments (not escaped \%)
  text = text.replace(/(?<!\\)%[^\n]*/g, '')

  // 4. Strip display math environments wholesale
  const mathEnvs = ['equation', 'align', 'gather', 'multline', 'eqnarray', 'flalign', 'alignat']
  for (const env of mathEnvs) {
    const re = new RegExp(`\\\\begin\\{${env}\\*?\\}[\\s\\S]*?\\\\end\\{${env}\\*?\\}`, 'g')
    text = text.replace(re, ' ')
  }

  // 5. Strip inline math: $...$ and \(...\)
  text = text.replace(/\\\([^)]*\\\)/g, ' ')
  text = text.replace(/(?<![\\])\$[^$]*(?<![\\])\$/g, ' ')

  // 6. Strip \begin{...} / \end{...} delimiters but keep body
  text = text.replace(/\\(?:begin|end)\{[^}]*\}/g, '')

  // 7. Strip LaTeX commands
  // First pass: commands whose argument should be discarded
  text = text.replace(/\\([a-zA-Z]+)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, (_, cmd, arg) => {
    if (DISCARD_ARG_CMDS.test(`\\${cmd}`)) return ' '
    return arg
  })

  // Second pass: bare commands with no braces (e.g. \newpage, \noindent, \par, etc.)
  text = text.replace(/\\[a-zA-Z]+\*?/g, ' ')

  // 8. Remove leftover LaTeX punctuation artifacts
  text = text.replace(/[{}]/g, '')

  // 9. Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  // Count vowel groups as syllable approximation
  const matches = w.match(/[aeiouy]+/g)
  let count = matches ? matches.length : 1
  // Silent e at end
  if (w.endsWith('e') && w.length > 2 && count > 1) count--
  return Math.max(1, count)
}

export function computeStats(rawLatex: string): DocStats | null {
  if (!rawLatex.trim()) return null

  const text = stripLatex(rawLatex)
  if (!text) return null

  // Character counts
  const charsWithSpaces = text.length
  const charsWithoutSpaces = text.replace(/\s/g, '').length

  // Words
  const wordList = text.split(/\s+/).filter(w => w.length > 0)
  const words = wordList.length

  // Sentences: split on . ! ? followed by whitespace or end
  const sentenceMatches = text.match(/[^.!?]*[.!?]+(\s|$)/g) ?? []
  const sentences = Math.max(1, sentenceMatches.length)

  // Paragraphs: blank-line separated blocks
  const paragraphList = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const paragraphs = Math.max(1, paragraphList.length)

  // Syllables
  const syllables = wordList.reduce((acc, w) => acc + countSyllables(w), 0)

  const avgWordsPerSentence = words / sentences
  const avgWordsPerParagraph = words / paragraphs
  const avgSyllablesPerWord = syllables / Math.max(1, words)

  // Flesch Reading Ease (standard formula)
  const fleschReadingEase = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord),
  )

  // Flesch-Kincaid Grade Level
  const fleschKincaidGradeLevel = Math.max(
    0,
    0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59,
  )

  // Reading time @ 200 wpm (academic reading pace)
  const readingTimeMinutes = words / 200

  return {
    charsWithSpaces,
    charsWithoutSpaces,
    words,
    sentences,
    paragraphs,
    avgWordsPerSentence,
    avgWordsPerParagraph,
    syllables,
    fleschReadingEase,
    fleschKincaidGradeLevel,
    readingTimeMinutes,
  }
}

export function fleschReadingLabel(score: number): string {
  if (score >= 90) return 'Very Easy'
  if (score >= 80) return 'Easy'
  if (score >= 70) return 'Fairly Easy'
  if (score >= 60) return 'Standard'
  if (score >= 50) return 'Fairly Difficult'
  if (score >= 30) return 'Difficult'
  return 'Very Difficult'
}
