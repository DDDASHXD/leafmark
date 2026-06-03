-- Map `author-entries` YAML into Pandoc `author` metadata with line breaks,
-- inline Markdown per line, and ORCID icon + link to the right of the name.

local ORCID_ICON_URL =
  "https://orcid.org/sites/default/files/images/orcid_16x16.png"

local function normalize_orcid_id(raw)
  local t = pandoc.utils.stringify(raw):match("^%s*(.-)%s*$")
  if t == "" then
    return nil
  end
  local from_url = t:match("orcid%.org/(%d%d%d%d%-%d%d%d%d%-%d%d%d%d%-%d%d%d[%dXx])")
  if from_url then
    return from_url:upper()
  end
  if t:match("^%d%d%d%d%-%d%d%d%d%-%d%d%d%d%-%d%d%d[%dXx]$") then
    return t:upper()
  end
  return nil
end

local function orcid_inlines(id)
  local url = "https://orcid.org/" .. id
  local img = pandoc.Image(
    "ORCID iD",
    ORCID_ICON_URL,
    "",
    { class = "orcid-icon", width = "16", height = "16" }
  )
  return { pandoc.Link({ img }, url, "", { class = "orcid-link" }) }
end

local function append_orcid_inline(acc, id_raw)
  local id = normalize_orcid_id(id_raw)
  if not id then
    return
  end
  table.insert(acc, pandoc.Space())
  for _, inl in ipairs(orcid_inlines(id)) do
    table.insert(acc, inl)
  end
end

local function is_orcid_item(item)
  if type(item) == "string" then
    return item:match("^orcid:%s*.+$") ~= nil
  end
  if type(item) == "table" then
    if item.tag == "MetaMap" and item.orcid then
      return true
    end
    if item.orcid then
      return true
    end
  end
  return false
end

local function orcid_id_from_item(item)
  if type(item) == "string" then
    local v = item:match("^orcid:%s*(.+)$")
    return v and normalize_orcid_id(v) or nil
  end
  if type(item) == "table" and item.orcid then
    return normalize_orcid_id(item.orcid)
  end
  return nil
end

local function append_markdown_line(acc, line_str, break_before)
  local s = pandoc.utils.stringify(line_str)
  if s == "" then
    return
  end
  if break_before and #acc > 0 then
    table.insert(acc, pandoc.LineBreak())
  end
  local doc = pandoc.read(s, "markdown")
  for _, block in ipairs(doc.blocks) do
    if block.t == "Para" then
      for _, inl in ipairs(block.content) do
        table.insert(acc, inl)
      end
    end
  end
end

local function collect_entry_items(entry)
  local items = {}
  if type(entry) == "string" then
    return { entry }
  end
  if type(entry) ~= "table" then
    return items
  end
  if entry.tag == "MetaList" then
    for _, item in ipairs(entry) do
      table.insert(items, item)
    end
    return items
  end
  for _, item in ipairs(entry) do
    table.insert(items, item)
  end
  return items
end

local function process_entry(entry)
  local items = collect_entry_items(entry)
  local text_items = {}
  local orcid_id = nil

  for _, item in ipairs(items) do
    if is_orcid_item(item) then
      orcid_id = orcid_id_from_item(item) or orcid_id
    else
      table.insert(text_items, item)
    end
  end

  local acc = {}
  if #text_items == 0 then
    if orcid_id then
      for _, inl in ipairs(orcid_inlines(orcid_id)) do
        table.insert(acc, inl)
      end
    end
    return acc
  end

  append_markdown_line(acc, text_items[1], false)
  if orcid_id then
    append_orcid_inline(acc, orcid_id)
  end
  for i = 2, #text_items do
    append_markdown_line(acc, text_items[i], true)
  end
  return acc
end

local function author_entries_to_inlines_list(raw)
  local out = {}
  if raw == nil then
    return out
  end
  local entries = raw
  if raw.tag == "MetaList" then
    entries = raw
  elseif type(raw) ~= "table" then
    return out
  end
  for _, entry in ipairs(entries) do
    local acc = process_entry(entry)
    if #acc > 0 then
      table.insert(out, acc)
    end
  end
  return out
end

function Meta(meta)
  local raw = meta["author-entries"]
  if raw == nil then
    return nil
  end

  local inline_lists = author_entries_to_inlines_list(raw)
  if #inline_lists == 0 then
    return nil
  end

  local authors = {}
  for _, acc in ipairs(inline_lists) do
    table.insert(authors, pandoc.MetaInlines(acc))
  end
  meta.author = pandoc.MetaList(authors)
  return meta
end
