-- Start the reference list on a new page, with the heading on the same page as the entries.
--
-- Citeproc emits an unnumbered `Header` (“Literaturliste”) and then a `Div` with id `refs`.
-- A page break must come *before* that header. Putting `\\clearpage` inside the `refs` Div
-- runs after the section title is written, which strands the title alone on the previous page.

function Pandoc(doc)
  if FORMAT ~= "latex" and FORMAT ~= "beamer" then
    return doc
  end
  local blocks = {}
  for i, block in ipairs(doc.blocks) do
    local nextb = doc.blocks[i + 1]
    if
      block.t == "Header"
      and nextb
      and nextb.t == "Div"
      and nextb.identifier == "refs"
    then
      table.insert(blocks, pandoc.RawBlock("latex", "\\clearpage\n"))
    end
    table.insert(blocks, block)
  end
  return pandoc.Pandoc(blocks, doc.meta)
end
