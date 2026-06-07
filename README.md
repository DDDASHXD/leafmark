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
pnpx @skxv/leafmark                    # build ./dist/output.pdf
pnpx @skxv/leafmark ./project          # read ./project, write ./dist/output.pdf
pnpx @skxv/leafmark --output ./build   # write ./build/output.pdf
pnpx @skxv/leafmark --output-format docx  # build output.docx
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
pnpx @skxv/leafmark status             # word and character counts (no build)
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

### Date formatting

Set `date` to an ISO value (`2026-02-16`) and optionally add `date-format` with a
[Unicode LDML](https://unicode.org/reports/tr35/tr35-dates.html#Date_Field_Symbol_Table)-style
pattern (same family as date-fns and Java). Leafmark formats the date before it
reaches Pandoc (title page, footer, HTML header).

```yaml
date: 2026-02-16
date-format: dd/MM/yyyy
```

Common tokens: `dd` (day), `MM` or `mm` (month), `yyyy` or `YYYY` (year), `yy`
(short year), `MMMM` / `MMM` (month name). Moment-style `DD` is also accepted.
Use `lang` to control month names (for example `lang: da` with `d. MMMM yyyy`).

### Hyphenation

By default, PDF and HTML output allow inside-word hyphenation when a line is full.
Set `hyphens: false` in metadata or `_frontmatter.md` to disable hyphenation and
wrap lines at spaces instead:

```yaml
hyphens: false
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

List packaged themes with:

```sh
pnpx @skxv/leafmark theme list
```

Builtin themes:

- `default` - current Leafmark thesis style with sans text and code-friendly output.
- `classic` - serif academic report with restrained headings and traditional spacing.
- `compact` - space-efficient single-column style for drafts and review copies.
- `multicolumn` - two-column article layout for dense notes, papers, and handouts.
- `cv` - one-page CV layout with structured frontmatter and Markdown work experience.

Apply a builtin theme from your project folder with:

```sh
pnpx @skxv/leafmark theme use cv
```

Theme manifests can provide default config and metadata. Project config and
project frontmatter override those defaults, so themes can define custom
frontmatter fields without taking ownership of the user's content.

### CV Theme

The `cv` theme is for a one-page resume or application CV. It uses structured
frontmatter for profile, contact details, education, skills, and languages. The
Markdown chapter content is treated as the work experience column.

Minimal `_frontmatter.md`:

```yaml
---
title: Alex Morgan
subtitle: Frontend Developer
profile: |
  Frontend developer with experience building maintainable user interfaces,
  design systems, and content-heavy web products.
contact:
  website: alexmorgan.dev
  email: alex@example.com
  phone: "+1 555 010 2000"
education-title: Education
education:
  - institution: Example University
    degree: BSc Computer Science
    period: 2021 - 2024
    description: Focused on web engineering, databases, and human-computer interaction.
skills-title: Skills & languages
skills-label: "Skills:"
skills:
  - Figma
  - Git
  - Next.js
  - React
  - TypeScript
  - UI design
languages-label: "Languages:"
languages:
  - English (native)
  - Spanish (professional working proficiency)
---
```

Example `experience.md`:

```md
# Acme Studio / Frontend Developer

2024 - present

Built production user interfaces in React and Next.js, collaborated with
designers on reusable components, and improved frontend delivery workflows.

# Northwind Labs / Web Developer

2023 - 2024

Developed marketing and product pages, maintained a shared design system, and
worked with stakeholders to turn content requirements into shipped features.
```

Supported CV fields:

- `title` and `subtitle` render as the name and role.
- `profile` renders as the introductory paragraph below the header.
- `contact.website`, `contact.email`, and `contact.phone` render in the top-right contact block.
- `contact.lines` can add extra contact lines.
- `experience-title` changes the left-column heading. The default is `Experience`.
- `education-title` changes the education heading. The default is `Education`.
- `education` is a list of entries with `institution`, `degree`, `period`, and `description`.
- `skills-title`, `skills-label`, and `skills` control the skills block.
- `languages-label` and `languages` control the language block.
- `sidebar` can add extra Markdown-supported content below the right column.

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
