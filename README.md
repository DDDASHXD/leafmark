# leafmark

Comprehensive Markdown to PDF and HTML, powered by Pandoc.

## Usage

```sh
pnpx @skxv/leafmark ./folder/with/markdown
```

If you are already in a folder containing `_frontmatter.md`, run:

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
pnpx @skxv/leafmark init ./my-project  # create a starter markdown folder
pnpx @skxv/leafmark doctor             # check external tools
```

Bundles are supported when a subfolder contains its own `_frontmatter.md`:

```sh
pnpx @skxv/leafmark ./project-folder analysis
```

## Input Format

A standalone folder should contain:

```text
_frontmatter.md
1-introduction.md
2-method.md
sources.bib
```

`_frontmatter.md` must be a Markdown file with YAML front matter. Numbered
chapter files matching `N-name.md` are included in numeric order.

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
