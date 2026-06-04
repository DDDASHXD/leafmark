function Table(el)
  return {
    pandoc.RawBlock('latex', '\\end{multicols}'),
    el,
    pandoc.RawBlock('latex', '\\begin{multicols}{2}\n\\setlength{\\textwidth}{\\columnwidth}')
  }
end
