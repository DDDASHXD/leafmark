# Leafmark Theme Instructions

This repository is structured as a Leafmark theme. Keep all theme assets inside `.leafmark/` so the theme can be installed from GitHub with:

```sh
pnpx @skxv/leafmark theme use https://github.com/USER/REPO
```

## Structure

```text
.leafmark/
  theme.json        # Theme manifest used by leafmark theme use
  templates/        # Pandoc .latex templates
  includes/         # LaTeX snippets loaded during PDF builds
  css/              # HTML/print stylesheets
  fonts/            # Optional local .ttf/.otf font files
project/            # Local ignored test document
```

## Manifest

`theme.json` describes the files Leafmark should copy into a project and the config it should write. Paths in `theme.json` should use install-time paths under `.leafmark/theme/`, for example:

```json
{
  "config": {
    "latexTemplate": ".leafmark/theme/templates/theme.latex",
    "fonts": {
      "latexInclude": ".leafmark/theme/includes/theme.tex",
      "css": [".leafmark/theme/css/theme.css"]
    }
  }
}
```

## Local Font Files

Place physical font files in `.leafmark/fonts/`. PDF builds can reference them with `fonts.pdfFiles`:

```json
{
  "fonts": {
    "pdfFiles": {
      "path": ".leafmark/theme/fonts",
      "upright": "YourFont-Regular.ttf",
      "bold": "YourFont-Bold.ttf",
      "italic": "YourFont-Italic.ttf",
      "boldItalic": "YourFont-BoldItalic.ttf",
      "scale": 1
    }
  }
}
```

HTML styles can use the same files with `@font-face` in `.leafmark/css/theme.css`.

## Testing Locally

The `project/` folder is ignored by git and configured to use the theme source files directly. Test with:

```sh
pnpx @skxv/leafmark ./project --html
```

Regenerate the sample project whenever needed, but avoid committing generated `project/` output.
