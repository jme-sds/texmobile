"""Demo project templates seeded into the demo account on each daily reset."""

from pathlib import Path

_HELLO_WORLD = r"""\documentclass{article}
\usepackage[T1]{fontenc}
\usepackage{microtype}

\title{Hello, \LaTeX!}
\author{Texmobile Demo}
\date{\today}

\begin{document}
\maketitle

\section{Welcome to Texmobile}
This is your first \LaTeX{} document. Click \textbf{Compile} in the
top-right corner to generate the PDF on the right.

\section{Getting Started}
\begin{itemize}
  \item Edit this file in the \textbf{Editor} pane on the left.
  \item Compiled output appears in the \textbf{PDF} pane on the right.
  \item Use the \textbf{Files} pane to create, upload, or delete files.
  \item Open the \textbf{Chat} icon to get AI assistance with your document.
\end{itemize}

\section{Your First Edit}
Try changing the title above and recompiling. Then create a new project
from the Files pane to start your own work!

\end{document}
"""

_ACADEMIC_PAPER = r"""\documentclass[12pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{microtype}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{A Template for Academic Papers}
\author{Author Name \\
  \small Department of Computer Science \\
  \small University Name \\
  \small \texttt{author@university.edu}}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
This template demonstrates a standard academic paper structure in \LaTeX.
Replace this placeholder with your own 150--250 word abstract summarising
the problem, methodology, results, and conclusions. The abstract should be
self-contained and readable without the rest of the paper.
\end{abstract}

\section{Introduction}
Provide background and motivation for your work. Clearly state the research
problem and your contributions. End with a brief outline of the paper
structure.

\section{Related Work}
Survey prior art and position your contribution relative to existing
approaches. Be specific about how your work differs or extends previous results.

\section{Methodology}
Describe your approach. Use numbered equations where helpful:
\begin{equation}
  \mathcal{L}(\theta) = -\sum_{i=1}^{N} \log p(y_i \mid x_i;\, \theta).
  \label{eq:loss}
\end{equation}
Reference equations by label: the objective in Equation~\eqref{eq:loss}
is minimised by stochastic gradient descent.

\section{Results}
Present your findings with appropriate tables and figures. Interpret each
result in context rather than leaving it to the reader.

\section{Discussion}
Interpret results, acknowledge limitations, and suggest directions for
future work.

\section{Conclusion}
Summarise the key contributions in two or three sentences. Reiterate the
significance of the results without introducing new information.

\end{document}
"""

_BEAMER = r"""\documentclass{beamer}
\usetheme{Madrid}
\usecolortheme{default}
\usepackage[T1]{fontenc}
\usepackage{microtype}
\usepackage{amsmath}

\title[Texmobile Beamer Demo]{A Beamer Presentation Template}
\subtitle{Created with Texmobile}
\author{Presenter Name}
\institute[Org]{Organisation}
\date{\today}

\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Outline}
  \tableofcontents
\end{frame}

\section{Introduction}

\begin{frame}{Motivation}
  \begin{itemize}
    \item First motivation point
    \item Second motivation point
    \item Third motivation point
  \end{itemize}
\end{frame}

\section{Main Content}

\begin{frame}{Key Result}
  \begin{theorem}
    For all $n \geq 1$,\quad
    $\displaystyle\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$.
  \end{theorem}
  \begin{proof}
    By induction on $n$. \qed
  \end{proof}
\end{frame}

\begin{frame}{Two-Column Layout}
  \begin{columns}
    \column{0.5\textwidth}
      \textbf{Left column} \\[6pt]
      Use this layout for side-by-side comparisons or a figure paired
      with explanatory text.
    \column{0.5\textwidth}
      \textbf{Right column} \\[6pt]
      Each column can contain any valid \LaTeX{} content including
      equations, lists, or \texttt{\textbackslash includegraphics}.
  \end{columns}
\end{frame}

\section{Conclusion}

\begin{frame}{Summary}
  \begin{block}{Main Takeaways}
    \begin{enumerate}
      \item Key point one
      \item Key point two
      \item Key point three
    \end{enumerate}
  \end{block}
\end{frame}

\begin{frame}[plain]
  \centering
  \Large Thank you! \\[12pt]
  \normalsize Questions?
\end{frame}

\end{document}
"""


def create_demo_projects(user_dir: Path) -> None:
    """Seed the three example projects into user_dir."""
    _write_project(user_dir / "hello-world", {"main.tex": _HELLO_WORLD})
    _write_project(user_dir / "academic-paper", {"main.tex": _ACADEMIC_PAPER})
    _write_project(user_dir / "beamer-presentation", {"main.tex": _BEAMER})


def _write_project(project_dir: Path, files: dict[str, str]) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (project_dir / name).write_text(content, encoding="utf-8")
