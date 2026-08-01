import { readFileSync } from 'node:fs';

const compiled = readFileSync(new URL('../dist/extension.js', import.meta.url), 'utf8');
const templateStart = compiled.indexOf('return `<!doctype html>');
const templateEnd = compiled.indexOf('</html>`;', templateStart);
if (templateStart < 0 || templateEnd < 0) throw new Error('Unable to find compiled webview HTML');

let htmlTemplate = compiled.slice(templateStart + 'return `'.length, templateEnd + '</html>'.length);
htmlTemplate = htmlTemplate.replaceAll(/\$\{[^}]+\}/g, 'placeholder');
const script = htmlTemplate.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Unable to find compiled webview script');
new Function(script);
console.log('Webview script syntax is valid.');
