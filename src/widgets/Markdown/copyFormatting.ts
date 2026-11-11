// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

// Text copied from the note viewer (on the web) keeps its formatting (bold, italics, struck through,
// code, the sizes of headings) but not the colours of the theme, which the browser would copy too:
// pasted elsewhere, it would be light text on a dark background.

import { fonts } from "../../theme";

interface Font {
  bold: boolean;
  italic: boolean;
  mono: boolean;
  size: number;
}

interface Format extends Font {
  struck: boolean;
  underlined: boolean;
}

function fontOf(style: CSSStyleDeclaration): Font {
  return {
    // (the app's font has a face for every weight, which its bold text is in, rather than a weight)
    bold: (parseInt(style.fontWeight) >= 600) || style.fontFamily.includes(fonts.bold) || style.fontFamily.includes(fonts.semibold),
    italic: style.fontStyle === "italic",
    mono: style.fontFamily.includes("monospace"),
    size: parseFloat(style.fontSize),
  };
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The HTML of a part of the copy, with the formatting it has more than its parent. Only elements
// with text of their own tell it (the others, e.g. paragraphs, have the page's font). The elements
// around the selection (in `around`) only give their formatting: they aren't copied as blocks.
function toHtml(node: Node, parent: Format, around: Set<Node>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escape(node.textContent ?? "");
  }
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  const style = getComputedStyle(node);
  if (style.display === "none") {
    return "";
  }
  if (node instanceof HTMLImageElement) {
    return `<img src="${escape(node.src)}" alt="${escape(node.alt)}">`;
  }
  const hasText = Array.from(node.childNodes).some((x) => (x.nodeType === Node.TEXT_NODE) && x.textContent);
  // (the lines of text decorations aren't inherited, but they go through what's in them)
  const struck = style.textDecorationLine.includes("line-through");
  const underlined = style.textDecorationLine.includes("underline");
  const format: Format = {
    ...((hasText) ? fontOf(style) : parent),
    struck: parent.struck || struck,
    underlined: parent.underlined || underlined,
  };
  const block = !around.has(node) && !style.display.startsWith("inline");

  const css = [];
  if (format.bold !== parent.bold) {
    css.push(`font-weight: ${(format.bold) ? "bold" : "normal"}`);
  }
  if (format.italic !== parent.italic) {
    css.push(`font-style: ${(format.italic) ? "italic" : "normal"}`);
  }
  if (format.size !== parent.size) {
    css.push(`font-size: ${format.size}px`);
  }
  const attrs = (css.length > 0) ? ` style="${css.join("; ")}"` : "";

  let html = Array.from(node.childNodes, (x) => toHtml(x, format, around)).join("");
  if (format.struck && !parent.struck) {
    html = `<s>${html}</s>`;
  }
  if (format.underlined && !parent.underlined) {
    html = `<u>${html}</u>`;
  }
  if (format.mono && !parent.mono) {
    return (block) ? `<pre${attrs}><code>${html}</code></pre>` : `<code${attrs}>${html}</code>`;
  }
  if (block) {
    return `<div${attrs}>${html}</div>`;
  }
  return (attrs) ? `<span${attrs}>${html}</span>` : html;
}

// The HTML of what's selected in the viewer (`root`), or undefined when the selection isn't all
// in it. `fontSize` and `mono` are those of the note's text.
export function selectionHtml(root: HTMLElement, fontSize: number, mono: boolean): string | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return undefined;
  }
  const ranges = Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i));
  if ((ranges.length === 0) || !ranges.every((x) => root.contains(x.commonAncestorContainer))) {
    return undefined;
  }

  // The copy is put in the viewer for a moment, as the styles of its elements are only known there
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position: fixed; left: -100000px; top: 0;";
  const around = new Set<Node>();
  for (const range of ranges) {
    let copy: Node = range.cloneContents();
    // (with the elements the selection is in, e.g. the bold text a selected word is part of)
    const start = range.commonAncestorContainer;
    for (let el = (start instanceof Element) ? start : start.parentElement; el && (el !== root); el = el.parentElement) {
      const outer = el.cloneNode(false);
      outer.appendChild(copy);
      around.add(outer);
      copy = outer;
    }
    holder.appendChild(copy);
  }
  root.appendChild(holder);
  try {
    const plain = { bold: false, italic: false, mono, size: fontSize, struck: false, underlined: false };
    const html = Array.from(holder.childNodes, (x) => toHtml(x, plain, around)).join("");
    // (line breaks in the text are kept, as the viewer shows them)
    return `<div style="white-space: pre-wrap">${html}</div>`;
  } finally {
    holder.remove();
  }
}
