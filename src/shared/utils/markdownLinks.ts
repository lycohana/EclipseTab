import { normalizeUrl } from './url';

/**
 * Markdown 风格超链接解析工具
 * 支持语法：[显示文本](URL)
 */

export interface ParsedLink {
    text: string;      // 显示文本
    url: string;       // 链接地址
    startIndex: number; // 在原文本中的起始位置
    endIndex: number;   // 在原文本中的结束位置
}

const STORED_MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const EDITABLE_LINK_REGEX = /\(([^)]+)\)\[([^\]]+)\]/g;
const ANY_SUPPORTED_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)|\(([^)]+)\)\[([^\]]+)\]/g;

/**
 * 解析文本中的 Markdown 链接
 * @param text - 输入文本
 * @returns 解析出的链接数组
 */
export function parseMarkdownLinks(text: string): ParsedLink[] {
    const links: ParsedLink[] = [];
    let match: RegExpExecArray | null;

    while ((match = ANY_SUPPORTED_LINK_REGEX.exec(text)) !== null) {
        const isStoredMarkdown = match[1] !== undefined && match[2] !== undefined;
        links.push({
            text: isStoredMarkdown ? match[1] : match[3],
            url: isStoredMarkdown ? match[2] : match[4],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
        });
    }

    return links;
}

/**
 * 将文本分割为普通文本和链接片段
 * @param text - 输入文本
 * @returns 片段数组，每个片段包含类型和内容
 */
export function splitTextWithLinks(text: string): Array<{ type: 'text' | 'link'; content: string; url?: string }> {
    const links = parseMarkdownLinks(text);
    
    if (links.length === 0) {
        return [{ type: 'text', content: text }];
    }
    
    const fragments: Array<{ type: 'text' | 'link'; content: string; url?: string }> = [];
    let lastIndex = 0;
    
    for (const link of links) {
        // 添加链接前的普通文本
        if (link.startIndex > lastIndex) {
            fragments.push({
                type: 'text',
                content: text.slice(lastIndex, link.startIndex),
            });
        }
        
        // 添加链接
        fragments.push({
            type: 'link',
            content: link.text,
            url: normalizeUrl(link.url),
        });
        
        lastIndex = link.endIndex;
    }
    
    // 添加链接后的普通文本
    if (lastIndex < text.length) {
        fragments.push({
            type: 'text',
            content: text.slice(lastIndex),
        });
    }
    
    return fragments;
}

/**
 * 检查文本是否包含 Markdown 链接
 */
export function hasMarkdownLinks(text: string): boolean {
    return parseMarkdownLinks(text).length > 0;
}

/**
 * 检测并转换纯 URL 为 Markdown 链接格式
 * 例如：https://example.com -> [https://example.com](https://example.com)
 * @param text - 输入文本
 * @returns 转换后的文本
 */
export function autoConvertUrlsToLinks(text: string): string {
    return splitMarkdownAwareFragments(text)
        .map((fragment) => fragment.type === 'link' ? fragment.content : convertPlainUrlsToMarkdown(fragment.content))
        .join('');
}

/**
 * 从编辑后的文本重建 Markdown 链接
 * 当用户编辑了链接文本后，需要将纯文本重新格式化为 Markdown 链接
 * @param text - 编辑后的文本
 * @param originalContent - 原始 Markdown 内容
 * @returns 重建后的 Markdown 文本
 */
export function rebuildMarkdownLinks(text: string, originalContent: string): string {
    const originalLinks = parseMarkdownLinks(originalContent);
    
    if (originalLinks.length === 0) {
        return autoConvertUrlsToLinks(text);
    }
    
    let result = text;
    
    // 遍历原始链接，尝试在编辑后的文本中找到对应的部分并重建
    for (const link of originalLinks) {
        // 检查编辑后的文本是否包含原来的链接文本
        if (text.includes(link.text)) {
            // 替换回 Markdown 链接格式
            result = result.replace(
                new RegExp(`\\b${escapeRegExp(link.text)}\\b`, 'g'),
                `[${link.text}](${link.url})`
            );
        }
    }
    
    return result;
}

/**
 * 转义正则表达式中的特殊字符
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将 Markdown 链接转换为纯文本显示（用于编辑模式）
 * 例如：[Google](https://google.com) -> Google
 * @param text - 包含 Markdown 链接的文本
 * @returns 转换后的纯文本
 */
export function markdownToPlainText(text: string): string {
    return text
        .replace(STORED_MARKDOWN_LINK_REGEX, '$1')
        .replace(EDITABLE_LINK_REGEX, '$1');
}

/**
 * 将存储格式转换为可编辑文本
 * 例如：[Google](https://google.com) -> (Google)[https://google.com]
 */
export function markdownToEditableText(text: string): string {
    return text.replace(ANY_SUPPORTED_LINK_REGEX, (_match, markdownText, markdownUrl, editableText, editableUrl) => {
        const linkText = markdownText ?? editableText;
        const linkUrl = markdownUrl ?? editableUrl;
        return `(${linkText})[${linkUrl}]`;
    });
}

/**
 * 从纯文本重建 Markdown 链接
 * 根据原始 Markdown 内容中的链接信息，将编辑后的纯文本重新格式化为 Markdown
 * @param editedText - 编辑后的纯文本
 * @param originalMarkdown - 原始 Markdown 内容
 * @returns 重建后的 Markdown 文本
 */
export function rebuildMarkdownFromEditText(editedText: string, originalMarkdown: string): string {
    const trimmedEditedText = editedText.trim();
    if (!trimmedEditedText) {
        return '';
    }

    const originalEditableText = markdownToEditableText(originalMarkdown).trim();
    if (originalEditableText && originalEditableText === trimmedEditedText) {
        return normalizeEditableLinksToMarkdown(originalMarkdown);
    }

    const normalizedLinks = normalizeEditableLinksToMarkdown(trimmedEditedText);
    return autoConvertUrlsToLinks(normalizedLinks);
}

function splitMarkdownAwareFragments(text: string): Array<{ type: 'text' | 'link'; content: string }> {
    const links = parseMarkdownLinks(text);
    if (links.length === 0) {
        return [{ type: 'text', content: text }];
    }

    const fragments: Array<{ type: 'text' | 'link'; content: string }> = [];
    let lastIndex = 0;

    for (const link of links) {
        if (link.startIndex > lastIndex) {
            fragments.push({
                type: 'text',
                content: text.slice(lastIndex, link.startIndex),
            });
        }

        fragments.push({
            type: 'link',
            content: text.slice(link.startIndex, link.endIndex),
        });

        lastIndex = link.endIndex;
    }

    if (lastIndex < text.length) {
        fragments.push({
            type: 'text',
            content: text.slice(lastIndex),
        });
    }

    return fragments;
}

function convertPlainUrlsToMarkdown(text: string): string {
    const urlRegex = /(^|[\s(（])((?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]+)/gi;

    return text.replace(urlRegex, (_match, prefix: string, rawUrl: string) => {
        const normalizedUrl = normalizeUrl(rawUrl);
        return `${prefix}[${rawUrl}](${normalizedUrl})`;
    });
}

function normalizeEditableLinksToMarkdown(text: string): string {
    return text
        .replace(EDITABLE_LINK_REGEX, (_match, linkText: string, linkUrl: string) => `[${linkText}](${normalizeUrl(linkUrl)})`)
        .replace(STORED_MARKDOWN_LINK_REGEX, (_match, linkText: string, linkUrl: string) => `[${linkText}](${normalizeUrl(linkUrl)})`);
}
