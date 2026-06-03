-- Map simple paired inline HTML tags to LaTeX for PDF output.
-- HTML / HTML5 targets keep the original tags.

local LATEX_SIZE_TAGS = {
  big = "\\large",
  small = "\\small",
}

local function is_html_raw(inline, text)
  return inline.t == "RawInline" and inline.format:match("html") and inline.text == text
end

local function open_tag_name(inline)
  if inline.t ~= "RawInline" or not inline.format:match("html") then
    return nil
  end
  return inline.text:match("^<(%w+)>$")
end

local function process_inlines(inlines)
  local out = {}
  local i = 1

  while i <= #inlines do
    local el = inlines[i]
    local tag = open_tag_name(el)

    if tag then
      local close = "</" .. tag .. ">"
      local inner = {}
      local j = i + 1
      local closed = false

      while j <= #inlines do
        if is_html_raw(inlines[j], close) then
          closed = true
          break
        end
        table.insert(inner, inlines[j])
        j = j + 1
      end

      if closed then
        local body = process_inlines(inner)
        if FORMAT == "latex" or FORMAT == "beamer" then
          local size_cmd = LATEX_SIZE_TAGS[tag:lower()]
          if size_cmd then
            table.insert(out, pandoc.RawInline("latex", "{" .. size_cmd .. " "))
            for _, inl in ipairs(body) do
              table.insert(out, inl)
            end
            table.insert(out, pandoc.RawInline("latex", "}"))
          else
            for _, inl in ipairs(body) do
              table.insert(out, inl)
            end
          end
        else
          table.insert(out, pandoc.RawInline("html", "<" .. tag .. ">"))
          for _, inl in ipairs(body) do
            table.insert(out, inl)
          end
          table.insert(out, pandoc.RawInline("html", "</" .. tag .. ">"))
        end
        i = j + 1
      else
        table.insert(out, el)
        i = i + 1
      end
    else
      table.insert(out, el)
      i = i + 1
    end
  end

  return out
end

function Inlines(inlines)
  return process_inlines(inlines)
end
