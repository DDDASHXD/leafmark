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
pnpx @skxv/leafmark                    # build ./dist/<project-name>.pdf
pnpx @skxv/leafmark ./project          # write ./dist/project.pdf
pnpx @skxv/leafmark ./project/file.md  # write ./project/file.pdf
pnpx @skxv/leafmark --output ./build   # write the PDF under ./build
pnpx @skxv/leafmark --output-format docx  # build a named .docx file
pnpx @skxv/leafmark --html             # also build a named .html file
pnpx @skxv/leafmark --html-only        # only build the named .html file
pnpx @skxv/leafmark --keep-build-files # retain generated Pandoc intermediates
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

## Frontmatter Reference

Metadata can be written as YAML in `_frontmatter.md`, or as JSON under
`metadata` in `.leafmark/config.json`. Both locations accept the same keys. If
both are present, `_frontmatter.md` takes precedence over `metadata` in the
project config.

An `_frontmatter.md` file must contain a YAML document between `---` markers:

```yaml
---
title: Example Report
author:
  - Example Author
date: 2026-07-31
---
```

### Document metadata

| Option        | Type           | Default                  | Description                                                                   |
| ------------- | -------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `title`       | string         | empty                    | Document title.                                                               |
| `subtitle`    | string         | empty                    | Document subtitle.                                                            |
| `author`      | string or list | empty                    | One or more authors. Supports the structured format described below.          |
| `authors`     | string or list | empty                    | Alias for `author`; `author` wins when both are present.                      |
| `date`        | string         | empty                    | Document date. Used on the title page and as the default left footer.         |
| `date-format` | string         | none                     | Formats `date` using an LDML-style pattern before rendering.                  |
| `lang`        | string         | `en` for date formatting | Document language passed to Pandoc and locale used for formatted month names. |
| `keywords`    | string or list | empty                    | Document keywords passed to Pandoc.                                           |
| `abstract`    | string         | empty                    | Abstract content. YAML block strings are supported.                           |
| `styles`      | list of strings| empty                    | CSS files used by HTML output and when rendering HTML blocks as images. Paths resolve from the project folder. |

Authors can be a single string, a flat list with one author per item, or a
nested list with multiple lines per author. Author lines support Markdown.
ORCID can be written as an `orcid:` string, a bare iD in an `orcid` object, or
an ORCID URL:

```yaml
author:
  - - "**Alex Morgan**"
    - Department of Examples
    - alex@example.com
    - orcid: 0000-0002-1825-0097
  - - Sam Lee
    - "orcid: https://orcid.org/0009-0004-1352-0651"
```

In a flat list, every item is treated as a separate author:

```yaml
author:
  - Alex Morgan
  - Sam Lee
```

### Layout and navigation

| Option            | Type    | Default             | Description                                               |
| ----------------- | ------- | ------------------- | --------------------------------------------------------- |
| `title-page`      | boolean | `true`              | Show the formatted PDF title block and HTML title header. |
| `toc`             | boolean | `false`             | Generate a table of contents.                             |
| `toc-depth`       | integer | `3`                 | Deepest heading level included in the table of contents.  |
| `toc-own-page`    | boolean | `false`             | Put the PDF table of contents on its own page.            |
| `toc-title`       | string  | `Table of Contents` | Table-of-contents heading.                                |
| `number-sections` | boolean | `false`             | Number document headings.                                 |
| `hyphens`         | boolean | `true`              | Allow inside-word hyphenation in PDF and HTML output.     |

### PDF headers and footers

| Option          | Type           | Default       | Description                                                                                                    |
| --------------- | -------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `header-left`   | string         | empty         | Left PDF page header.                                                                                          |
| `header-center` | string         | empty         | Center PDF page header.                                                                                        |
| `header-right`  | string         | empty         | Right PDF page header.                                                                                         |
| `footer-left`   | string or null | document date | Left PDF footer. If no date is set, it uses LaTeX's current date. Set to an empty string or `null` to hide it. |
| `footer-center` | string         | empty         | Center PDF footer.                                                                                             |
| `footer-right`  | string or null | page number   | Right PDF footer. Set to an empty string or `null` to hide it.                                                 |

Header and footer values are rendered as plain text and escaped for LaTeX.

### References, cover, and template

| Option             | Type                     | Default                     | Description                                                                                                                  |
| ------------------ | ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `bibliography`     | string, list, or `false` | `sources.bib` when present  | One or more bibliography files. Relative paths resolve from the project folder. Set to `false` or `[]` to disable citations. |
| `references-title` | string                   | `References`                | Heading used for the generated reference list.                                                                               |
| `coverpage`        | string or `false`        | disabled                    | PDF file prepended to the generated PDF with `pdfunite`. Relative paths resolve from the project folder.                     |
| `latex-template`   | string or `false`        | configured/default template | Custom Pandoc LaTeX template. Relative paths resolve from the project folder.                                                |

`coverpage` only affects PDF output. Use `--no-merge-cover` to ignore it for a
particular build.

### Pandoc template metadata

Leafmark forwards other keys to Pandoc. The bundled PDF templates directly
support these additional Pandoc variables:

| Option | Type | Description |
| --- | --- | --- |
| `documentclass` | string | LaTeX document class. |
| `classoption` | string or list | Options passed to the LaTeX document class. |
| `papersize` | string | Paper size such as `a4` or `letter`. |
| `fontsize` | string | Base font size such as `10pt`, `11pt`, or `12pt`. |
| `geometry` | string or list | LaTeX page geometry settings. |
| `linestretch` | number | Document line-spacing multiplier. |
| `toccolor` | string | LaTeX color used for table-of-contents links. |
| `thanks` | string | Title-page acknowledgement or thanks text. |
| `include-before` | string or list | Content inserted before the document body. |
| `include-after` | string or list | Content inserted after the document body. |

Theme or project `pandoc.pdfArgs` values can override the corresponding
frontmatter value. Pandoc also supports more format-specific metadata; unknown
keys remain available to custom templates and filters.

### Complete built-in example

```yaml
---
title: Example Report
subtitle: A complete Leafmark metadata example
author:
  - - "**Alex Morgan**"
    - Department of Examples
    - orcid: 0000-0002-1825-0097
date: 2026-07-31
date-format: d. MMMM yyyy
lang: en
keywords:
  - documentation
  - markdown
abstract: |
  A short summary of the document.

title-page: true
toc: true
toc-depth: 3
toc-own-page: true
toc-title: Contents
number-sections: true
hyphens: true

header-left: Example Report
header-center: ""
header-right: Alex Morgan
footer-left: ""
footer-center: Confidential
footer-right: null

bibliography:
  - sources.bib
references-title: Sources
coverpage: cover.pdf
latex-template: templates/report.latex
---
```

Additional frontmatter keys are forwarded to Pandoc and custom themes. This is
how theme-specific fields such as the CV theme's `profile`, `contact`, and
`education` work. `header-includes` and `fonts-include` are reserved because
Leafmark generates those values during PDF builds; setting `header-includes`
causes the build to stop with an explanatory error.

### HTML and CSS

Add project CSS files to the `styles` list in `_frontmatter.md`:

```yaml
styles:
  - styles/cards.css
  - styles/charts.css
```

HTML may then be written directly in a Markdown chapter. HTML output preserves
the markup and links the listed stylesheets. For PDF and DOCX output, each
block-level HTML fragment is rendered with the stylesheets in a headless
Chromium-based browser and embedded as a PNG image:

```html
<section class="summary-card">
  <h2>Quarterly summary</h2>
  <p>Revenue increased by <strong>18%</strong>.</p>
</section>
```

Chrome, Chromium, Edge, or Brave must be installed when a PDF or DOCX contains
HTML blocks. JavaScript inside HTML blocks is not executed.

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
