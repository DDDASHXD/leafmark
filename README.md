# leafmark

Comprehensive Markdown to PDF and HTML, powered by Pandoc.

## Usage

```sh
pnpx @skxv/leafmark ./folder/with/markdown
```

If you are already in a markdown project folder, run:

```sh
pnpx @skxv/leafmark
```

Leafmark also supports the older copied project layout where markdown lives in
`project/`.

## Commands

```sh
pnpx @skxv/leafmark                    # build output.pdf
pnpx @skxv/leafmark --html             # build output.pdf and thesis.html
pnpx @skxv/leafmark --html-only        # build thesis.html only
pnpx @skxv/leafmark watch              # rebuild continuously
pnpx @skxv/leafmark o                  # arrange chapters with arrow keys
pnpx @skxv/leafmark organize           # same as `o`
pnpx @skxv/leafmark init ./my-project  # create a starter markdown folder
pnpx @skxv/leafmark theme init ./theme # create a theme repository scaffold
pnpx @skxv/leafmark theme list         # list builtin themes
pnpx @skxv/leafmark theme use default  # install a builtin theme
pnpx @skxv/leafmark theme use https://github.com/user/theme-repo
pnpx @skxv/leafmark doctor             # check external tools
```

Bundles are supported when a subfolder contains its own `.leafmark/config.json`
or `_frontmatter.md`:

```sh
pnpx @skxv/leafmark ./project-folder analysis
```

## Input Format

A standalone folder should contain:

```text
.leafmark/
  config.json
introduction.md
method.md
sources.bib
```

`.leafmark/config.json` is optional, but it is where Leafmark saves chapter
order, theme choices, and project extensions. `_frontmatter.md` is still
supported for YAML metadata, but it is no longer required. Markdown chapter
files do not need numeric prefixes. When no saved order exists, numbered files
sort first by numeric prefix and all other markdown files sort naturally by
filename.

Example `.leafmark/config.json`:

```json
{
  "metadata": {
    "title": "My Leafmark Project",
    "author": ["Your Name"],
    "bibliography": "sources.bib"
  },
  "order": ["introduction.md", "method.md"],
  "template": "templates/report.latex",
  "fonts": {
    "pdf": "Aptos",
    "mono": "JetBrains Mono",
    "css": ["fonts/web.css"],
    "latexInclude": "fonts/custom-fonts.tex"
  },
  "plugins": [
    "plugins/cleanup.lua",
    {
      "luaFilter": "plugins/html-only.lua",
      "htmlArgs": ["--section-divs"]
    }
  ],
  "pandoc": {
    "args": ["--wrap=none"],
    "pdfArgs": [],
    "htmlArgs": []
  }
}
```

## Themes

Builtin themes are packaged like standalone theme repositories:

```text
src/themes/default/
  .leafmark/
    theme.json
    templates/
    includes/
    css/
```

A GitHub theme should expose the same `.leafmark` folder at the repository root.
Running `theme use` copies the theme files into your project under
`.leafmark/theme/` and updates `.leafmark/config.json`.

Create a new theme scaffold with:

```sh
pnpx @skxv/leafmark theme init ./my-theme
```

The scaffold includes `.leafmark/theme.json`, template/include/CSS folders, an
ignored `project/` test document, and `INSTRUCTIONS.md` for theme authors and
agents.

## External Tools

Leafmark is an npm package, but PDF generation depends on system tools:

- `pandoc`
- `xelatex` or `pdflatex`
- `pdfunite` for optional `coverpage` merging

On first run, Leafmark checks for missing tools and asks whether it should try
to install them. You can also run:

```sh
pnpx @skxv/leafmark doctor
```
