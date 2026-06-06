/** Strip common Markdown syntax and return plain text for counting. */
export function stripMarkdownToPlainText(source) {
    let text = source.replace(/\r\n/g, '\n');
    text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
    text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
    text = text.replace(/^#{1,6}\s+/gm, '');
    text = text.replace(/^>\s?/gm, '');
    text = text.replace(/^[-*_]{3,}\s*$/gm, ' ');
    text = text.replace(/^[\t ]*[-*+]\s+/gm, '');
    text = text.replace(/^[\t ]*\d+\.\s+/gm, '');
    text = text.replace(/\[\^[^\]]+\]/g, ' ');
    text = text.replace(/\$\$[\s\S]*?\$\$/g, ' ');
    text = text.replace(/\$[^$\n]+\$/g, ' ');
    text = text.replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
}
export function countPlainText(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return { charsWithSpaces: 0, charsWithoutSpaces: 0, words: 0 };
    }
    const charsWithSpaces = trimmed.length;
    const charsWithoutSpaces = trimmed.replace(/\s/g, '').length;
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    return { charsWithSpaces, charsWithoutSpaces, words };
}
//# sourceMappingURL=markdown-plain.js.map