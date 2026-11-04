// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Text pasted into the note editor with its formatting (copied from a web page, a document or a
// mail) is put in as Markdown: bold, italics, headings, lists, quotes, code, links and tables.

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
  strongDelimiter: "**",
  hr: "---",
});
turndown.use(gfm);
turndown.remove(["style", "script", "meta", "title", "head"]);
// The text is put in as it reads, not with backslashes before the characters Markdown could take
// as formatting (e.g. "file\_name")
turndown.escape = (text: string) => text;

// (the viewer strikes through between two tildes, not one, as the plugin has it)
turndown.addRule("strikethrough", {
  filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
  replacement: (content) => (content.trim()) ? `~~${content}~~` : content,
});

// List items with one space after their marker, as the formatting bar makes them (not three)
turndown.addRule("listItem", {
  filter: "li",
  replacement: (content, node) => {
    const parent = node.parentNode as HTMLElement;
    let prefix = "- ";
    if (parent.nodeName === "OL") {
      const start = Number(parent.getAttribute("start") || 1);
      prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
    }
    const inner = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n" + " ".repeat(prefix.length))
      // (a checkbox and the text after it, which has its own space)
      .replace(/^(\[[ x]\]) +/, "$1 ");
    return prefix + inner + ((node.nextSibling && !inner.endsWith("\n")) ? "\n" : "");
  },
});

// Code blocks that aren't a <pre><code>, as on many sites with highlighted code (spans in a <pre>)
turndown.addRule("preformatted", {
  filter: (node) => (node.nodeName === "PRE") && !node.querySelector("code"),
  replacement: (_content, node) => {
    const text = (node.textContent ?? "").replace(/\n$/, "");
    return "\n\n```\n" + text + "\n```\n\n";
  },
});

// Google Docs puts all of what's copied in a <b> that isn't bold, and marks bold, italics and
// strikethrough with styles on spans instead
turndown.addRule("notBold", {
  filter: (node) => (node.nodeName === "B") && /font-weight:\s*(normal|[1-5]00)\b/.test(node.getAttribute("style") ?? ""),
  replacement: (content) => content,
});
turndown.addRule("styledSpan", {
  filter: (node) => (node.nodeName === "SPAN") && !!spanMarker(node.getAttribute("style") ?? ""),
  replacement: (content, node) => {
    const marker = spanMarker((node as HTMLElement).getAttribute("style") ?? "");
    const inner = content.trim();
    if (!inner) {
      return content;
    }
    // (Markdown doesn't read markers with spaces inside of them)
    const lead = content.match(/^\s*/)![0];
    const trail = content.match(/\s*$/)![0];
    return lead + marker + inner + [...marker].reverse().join("") + trail;
  },
});

function spanMarker(style: string) {
  const bold = /font-weight:\s*(bold|[6-9]00)\b/.test(style);
  const italic = /font-style:\s*italic\b/.test(style);
  const struck = /text-decoration[^;]*line-through/.test(style);
  return ((struck) ? "~~" : "") + ((bold) ? "**" : "") + ((italic) ? "_" : "");
}

// The Markdown for what's pasted, or undefined when it has no formatting worth keeping (e.g. code
// copied from an editor, which colours it but has nothing Markdown has): then it's pasted as text.
export function htmlToMarkdown(html: string, plain: string): string | undefined {
  if (!html.trim()) {
    return undefined;
  }
  const markdown = turndown.turndown(html)
    // (no spaces of their own on otherwise empty lines, or more than one empty line together)
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!markdown || (markdown.replace(/\s+/g, "") === plain.replace(/\s+/g, ""))) {
    return undefined;
  }
  return markdown;
}
