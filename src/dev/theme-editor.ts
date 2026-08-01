import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnComplete } from "../build/pandoc.js";
import type { BasicTheme } from "../theme/engine.js";

const host = "127.0.0.1";
const port = Number(process.env.LEAFMARK_THEME_PORT ?? 4318);
const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const uiRoot = join(
  packageRoot,
  "src",
  "dev",
  "theme-editor-ui",
  "vite-app",
  "dist"
);
const scratch = mkdtempSync(join(tmpdir(), "leafmark-theme-editor-"));
const project = join(scratch, "example");
const output = join(scratch, "dist");
mkdirSync(join(project, ".leafmark"), { recursive: true });
mkdirSync(output, { recursive: true });
writeFileSync(join(project, "sample.md"), sampleMarkdown(), "utf-8");

let queue: Promise<void> = Promise.resolve();
const server = createServer((request, response) => {
  if (request.method === "GET") return staticFile(request.url ?? "/", response);
  if (request.method === "POST" && request.url === "/render") {
    queue = queue
      .then(() => render(request, response))
      .catch((error) => json(response, 500, { error: String(error) }));
    return;
  }
  response.writeHead(404).end("Not found");
});

server.listen(port, host, () => {
  console.log(`Leafmark theme editor: http://${host}:${port}`);
  console.log("Press Ctrl+C to stop.");
});
function cleanup(): void {
  server.close();
  rmSync(scratch, { recursive: true, force: true });
}
process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);

async function render(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const payload = JSON.parse(await body(request)) as { theme?: BasicTheme };
    if (
      !payload.theme ||
      typeof payload.theme !== "object" ||
      Array.isArray(payload.theme)
    )
      throw new Error("Expected a theme object.");
    writeFileSync(
      join(project, ".leafmark", "config.json"),
      JSON.stringify(
        {
          order: ["sample.md"],
          frontmatter: false,
          metadata: {
            title: "Theme specimen",
            subtitle: "A live Leafmark PDF",
            "title-page": false,
            toc: false
          },
          theme: payload.theme
        },
        null,
        2
      )
    );
    const tsx = join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const cli = join(packageRoot, "src", "build.ts");
    const result = await spawnComplete(
      process.execPath,
      [
        tsx,
        cli,
        project,
        "sample.md",
        "--output",
        output,
        "--skip-tools-check"
      ],
      { cwd: packageRoot }
    );
    if (result.status !== 0)
      return json(response, 422, {
        error: cleanError(result.stderr || result.stdout)
      });
    const pdf = readFileSync(join(output, "sample.pdf"));
    response.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": pdf.length,
      "cache-control": "no-store"
    });
    response.end(pdf);
  } catch (error) {
    json(response, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let value = "";
    request.setEncoding("utf-8");
    request.on("data", (chunk) => {
      value += chunk;
      if (value.length > 200_000) reject(new Error("Request is too large."));
    });
    request.on("end", () => resolveBody(value));
    request.on("error", reject);
  });
}
function staticFile(url: string, response: ServerResponse): void {
  const requested =
    url === "/"
      ? "index.html"
      : decodeURIComponent(url.split("?")[0]!).replace(/^\/+/, "");
  const path = resolve(uiRoot, requested);
  if (!path.startsWith(`${uiRoot}/`))
    return void response.writeHead(403).end("Forbidden");
  try {
    const data = readFileSync(path);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    response.writeHead(200, {
      "content-type": mime[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  } catch {
    response.writeHead(404).end("Run pnpm theme:editor:ui first.");
  }
}
function json(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
function cleanError(value: string): string {
  return value
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim()
    .slice(-4000);
}

function sampleMarkdown(): string {
  return `# Hello world

Nulla labore esse anim adipisicing culpa deserunt ad ea mollit qui esse in pariatur. Anim ea ea cillum incididunt et labore magna dolor aute labore consectetur esse pariatur ex cillum. Nostrud ut excepteur sunt nulla laborum aliqua. Amet excepteur ullamco minim deserunt amet mollit velit quis veniam minim culpa deserunt et est. Veniam do labore eiusmod aliqua excepteur sint enim nisi nulla veniam ut culpa ipsum nulla.

Pariatur amet qui consectetur aliquip esse elit non magna veniam nostrud elit nulla proident. Veniam est aliqua et commodo cillum aliquip duis labore. Ut adipisicing nostrud culpa culpa velit incididunt laborum est do eu tempor. Officia quis elit fugiat aliquip excepteur enim consequat ea deserunt est aliquip tempor commodo. Enim cupidatat pariatur ea exercitation reprehenderit dolor proident esse est id non mollit elit sit. Eiusmod consectetur sint quis culpa dolore officia reprehenderit. Excepteur mollit non ipsum reprehenderit duis fugiat consequat dolor consequat voluptate pariatur officia. Ad exercitation cillum dolore irure eu ipsum velit Lorem aliqua ex ex tempor laboris.

Duis aute velit duis do voluptate eiusmod laboris nostrud pariatur eu. Est laborum ipsum sunt culpa voluptate esse nisi quis excepteur est dolore culpa cupidatat id ad. Minim culpa sunt irure est amet cupidatat commodo qui reprehenderit. Consectetur aliqua veniam occaecat incididunt esse nisi exercitation esse et laboris. Labore ea dolore ut id cillum ut nisi amet anim in occaecat velit commodo aliqua nisi. Qui sit aliquip sint nisi nulla mollit Lorem. Culpa tempor eu incididunt mollit. Ut ullamco voluptate elit voluptate amet.

Velit dolor consequat Lorem laboris occaecat do irure. Reprehenderit nisi adipisicing velit magna aliquip mollit voluptate sunt tempor pariatur minim cupidatat nisi mollit. Aliqua ipsum non irure nostrud est occaecat elit anim laboris in officia. Consequat aliquip anim ea qui enim in minim excepteur tempor. Est nulla magna consectetur incididunt excepteur. Do nostrud deserunt nisi eu tempor eiusmod consectetur dolor et. Aliquip consectetur aliquip ex amet. Laborum consequat nulla id dolor ea do nisi.

Elit ex culpa esse nostrud et nulla. Minim quis nisi deserunt. Culpa tempor aliquip duis velit voluptate sint minim proident in sint reprehenderit consectetur ut mollit in. Ea deserunt proident incididunt.

Laboris ex sint officia proident laboris eiusmod consectetur irure. Non excepteur incididunt minim mollit aliqua esse nulla. Dolor deserunt in sunt reprehenderit laboris. Reprehenderit adipisicing duis eu adipisicing fugiat.

Deserunt reprehenderit occaecat sunt ut cupidatat dolore esse occaecat et dolore velit. Ut esse est ullamco ut minim officia esse dolore. Ullamco ullamco amet velit consectetur consequat elit esse ullamco officia veniam. Cillum duis excepteur et dolore occaecat anim laborum ipsum ut ut fugiat. Do exercitation labore aute consectetur ipsum aliqua sint aliqua ad nulla reprehenderit pariatur adipisicing. Culpa in exercitation dolore exercitation dolore veniam velit in consequat ipsum elit fugiat occaecat fugiat. Culpa sit tempor laboris. Nostrud pariatur dolor laboris.

Laboris veniam duis do laboris ad pariatur ea irure amet cillum qui id labore ad sunt. Nostrud qui aliquip nostrud velit aute velit sunt magna id elit laborum do cupidatat. Deserunt reprehenderit minim ipsum laboris mollit incididunt voluptate mollit sint reprehenderit excepteur. Non adipisicing laborum eu ipsum. Tempor culpa fugiat dolor nisi dolor quis culpa fugiat minim aute et et exercitation aliquip. Dolor sit et dolore anim enim nostrud officia non tempor do deserunt mollit. Anim reprehenderit tempor eu exercitation proident.

Ad amet do irure aliquip sit quis sint do ullamco reprehenderit ex in. Non ipsum magna consequat ullamco sunt. Excepteur dolor non consectetur deserunt aliquip nostrud in minim dolor deserunt. Consequat anim officia fugiat cillum anim commodo ut minim Lorem esse quis Lorem laboris nulla laborum. Nulla nostrud ullamco dolor id in dolore ut ad sit anim. Laborum nisi cillum voluptate nostrud enim adipisicing sint do sit minim quis elit. Reprehenderit mollit ex voluptate ad pariatur nostrud duis ut amet minim. Eiusmod est ut incididunt exercitation cupidatat.

Reprehenderit cupidatat labore occaecat ex incididunt mollit nisi pariatur. Dolor nostrud ipsum et. Tempor qui tempor et nostrud reprehenderit qui adipisicing et exercitation elit occaecat ipsum enim quis in. Ipsum velit amet laborum eiusmod tempor nisi aute amet minim.
# A practical theme specimen

Good typography makes a document feel inevitable. This page includes the structures that tend to reveal a theme's strengths and weaknesses: headings, body copy, links, lists, quotations, code, and tables.

## Rhythm and hierarchy

Paragraph spacing should create a steady rhythm without pulling related ideas apart. Text can be left aligned or justified; both are useful choices when applied deliberately.

> Design is not decoration. It is the visible logic of a document, expressed through proportion, contrast, and repetition.

- A short unordered list item
- A second item with **bold text** and a [useful link](https://leafmark.dev)
- A final item for checking indentation

### A small data table

| Element | Purpose | Example |
|:--|:--|--:|
| Margin | Frames the page | 24 mm |
| Leading | Keeps lines readable | 1.5 |
| Accent | Guides attention | Blue |

### Code and inline details

Use \`theme.typography\` to tune the document. A block should remain legible at print size:

\`\`\`ts
const theme = { colors: { accent: '#315c8c' } };
render(theme);
\`\`\`
`;
}

const UI = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leafmark theme editor</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17202a;background:#e8ebef}button,input,select{font:inherit}main{height:100%;display:grid;grid-template-columns:minmax(420px,1fr) 390px}.preview{position:relative;padding:24px;background:#747b84}.preview iframe{width:100%;height:100%;border:0;border-radius:8px;background:white;box-shadow:0 10px 32px #17202a44}.empty{position:absolute;inset:24px;display:grid;place-items:center;color:white}.panel{overflow:auto;background:#fbfaf8;border-left:1px solid #cfd3d7}.top{position:sticky;top:0;z-index:2;padding:20px 22px 14px;background:#fbfaf8eF;backdrop-filter:blur(12px);border-bottom:1px solid #e3e2df}.brand{display:flex;align-items:center;justify-content:space-between}.brand h1{font-size:18px;margin:0}.status{font-size:12px;color:#607080}.actions{display:flex;gap:8px;margin-top:14px}button{border:1px solid #c9ced3;background:white;border-radius:7px;padding:8px 11px;cursor:pointer}button.primary{background:#173d5f;color:white;border-color:#173d5f}form{padding:6px 22px 40px}fieldset{border:0;border-top:1px solid #e3e2df;margin:18px 0 0;padding:16px 0 0}legend{font-weight:700;font-size:13px;padding:0 8px 0 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:flex;flex-direction:column;gap:5px}.field.wide{grid-column:1/-1}label{font-size:11px;color:#58636d}input,select{width:100%;border:1px solid #c9ced3;border-radius:6px;padding:8px;background:white;color:#17202a}input[type=color]{height:36px;padding:3px}.error{display:none;margin-top:12px;padding:10px;border-radius:6px;background:#fff0ed;color:#8b2c1e;font-size:12px;white-space:pre-wrap}.error.show{display:block}@media(max-width:800px){main{grid-template-columns:1fr;grid-template-rows:56vh auto}.panel{border-left:0}.preview{padding:12px}.empty{inset:12px}}
</style></head><body><main><section class="preview"><div class="empty" id="empty">Rendering example PDF…</div><iframe id="pdf" title="Rendered example PDF"></iframe></section><aside class="panel"><div class="top"><div class="brand"><h1>Theme editor</h1><span class="status" id="status">Waiting</span></div><div class="actions"><button class="primary" id="copy">Copy config</button><button id="download">Download</button><button id="reset">Reset</button></div><div class="error" id="error"></div></div><form id="form">
<fieldset><legend>Page</legend><div class="grid"><div class="field"><label>Paper</label><select data-path="page.size"><option value="a4">A4</option><option value="letter">Letter</option></select></div><div></div><div class="field"><label>Top margin</label><input data-path="page.margins.top"></div><div class="field"><label>Right margin</label><input data-path="page.margins.right"></div><div class="field"><label>Bottom margin</label><input data-path="page.margins.bottom"></div><div class="field"><label>Left margin</label><input data-path="page.margins.left"></div></div></fieldset>
<fieldset><legend>Typography</legend><div class="grid"><div class="field wide"><label>Body font</label><input data-path="typography.bodyFont"></div><div class="field wide"><label>Heading font</label><input data-path="typography.headingFont"></div><div class="field wide"><label>Monospace font</label><input data-path="typography.monoFont"></div><div class="field"><label>Font size</label><input data-path="typography.fontSize"></div><div class="field"><label>Line height</label><input type="number" min="1" max="2.4" step="0.05" data-path="typography.lineHeight" data-number></div><div class="field wide"><label>Alignment</label><select data-path="typography.justify"><option value="left">Left</option><option value="justify">Justified</option></select></div></div></fieldset>
<fieldset><legend>Colors</legend><div class="grid" id="colors"></div></fieldset>
<fieldset><legend>Spacing</legend><div class="grid"><div class="field"><label>Paragraph</label><input data-path="spacing.paragraph"></div><div class="field"><label>List indent</label><input data-path="spacing.listIndent"></div><div class="field"><label>Before headings</label><input data-path="spacing.headingTop"></div><div class="field"><label>After headings</label><input data-path="spacing.headingBottom"></div></div></fieldset>
<fieldset><legend>Headings</legend><div class="grid"><div class="field"><label>Weight</label><select data-path="headings.weight"><option value="bold">Bold</option><option value="normal">Normal</option></select></div><div></div><div class="field"><label>H1 size</label><input data-path="headings.h1Size"></div><div class="field"><label>H2 size</label><input data-path="headings.h2Size"></div><div class="field"><label>H3 size</label><input data-path="headings.h3Size"></div></div></fieldset>
<fieldset><legend>Tables and blocks</legend><div class="grid"><div class="field"><label>Cell padding</label><input data-path="tables.cellPadding"></div><div class="field"><label>Border width</label><input data-path="tables.borderWidth"></div><div class="field"><label>Header background</label><input type="color" data-path="tables.headerBackground"></div><div class="field"><label>Striped rows</label><select data-path="tables.striped" data-boolean><option value="true">On</option><option value="false">Off</option></select></div><div class="field"><label>Block padding</label><input data-path="blocks.padding"></div><div class="field"><label>Corner radius</label><input data-path="blocks.radius"></div><div class="field"><label>Quote border</label><input data-path="blocks.quoteBorderWidth"></div></div></fieldset>
</form></aside></main><script>
const defaults=${JSON.stringify({ page: { size: "a4", margins: { top: "20mm", right: "30mm", bottom: "20mm", left: "30mm" } }, typography: { bodyFont: "inherit", headingFont: "inherit", monoFont: "inherit", fontSize: "11pt", lineHeight: 1.5, justify: "left" }, colors: { text: "#1a1a1a", heading: "#111111", link: "#0b57d0", muted: "#666666", accent: "#0b57d0", surface: "#f8f8f8", border: "#d8d8d8" }, spacing: { paragraph: "7pt", headingTop: "18pt", headingBottom: "7pt", listIndent: "18pt" }, headings: { weight: "bold", h1Size: "18pt", h2Size: "15pt", h3Size: "13pt" }, tables: { cellPadding: "5pt", borderWidth: "0.5pt", striped: true, headerBackground: "#eeeeee" }, blocks: { padding: "9pt", radius: "3pt", quoteBorderWidth: "3pt" } })};
let theme=structuredClone(defaults),timer,url,version=0;const form=document.querySelector('#form'),status=document.querySelector('#status'),error=document.querySelector('#error'),pdf=document.querySelector('#pdf'),empty=document.querySelector('#empty');
const colorRoot=document.querySelector('#colors');for(const key of Object.keys(defaults.colors)){colorRoot.insertAdjacentHTML('beforeend','<div class="field"><label>'+key[0].toUpperCase()+key.slice(1)+'</label><input type="color" data-path="colors.'+key+'"></div>')}
function get(path){return path.split('.').reduce((v,k)=>v[k],theme)}function set(path,value){const keys=path.split('.');let target=theme;for(const key of keys.slice(0,-1))target=target[key];target[keys.at(-1)]=value}
function sync(){document.querySelectorAll('[data-path]').forEach(el=>{el.value=String(get(el.dataset.path))})}sync();
form.addEventListener('input',e=>{const el=e.target;if(!el.dataset.path)return;let value=el.value;if(el.hasAttribute('data-number'))value=Number(value);if(el.hasAttribute('data-boolean'))value=value==='true';set(el.dataset.path,value);schedule()});
function schedule(){clearTimeout(timer);status.textContent='Changed';timer=setTimeout(render,450)}
async function render(){const own=++version;status.textContent='Rendering…';error.classList.remove('show');try{const result=await fetch('/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({theme})});if(!result.ok){const data=await result.json();throw new Error(data.error||'Render failed')}const blob=await result.blob();if(own!==version)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);pdf.src=url;empty.style.display='none';status.textContent='Ready'}catch(e){if(own!==version)return;status.textContent='Error';error.textContent=e.message;error.classList.add('show')}}
function configText(){return JSON.stringify({theme},null,2)}document.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(configText());status.textContent='Copied'};document.querySelector('#download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([configText()+'\\n'],{type:'application/json'}));a.download='config.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};document.querySelector('#reset').onclick=()=>{theme=structuredClone(defaults);sync();render()};render();
</script></body></html>`;
