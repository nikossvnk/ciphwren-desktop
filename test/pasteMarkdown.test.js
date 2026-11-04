// Text pasted into the note editor with its formatting is put in as Markdown, and text that has no
// formatting Markdown has (e.g. coloured code from an editor) is pasted as it is.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");

const { htmlToMarkdown } = require("../src/pasteMarkdown");

test("bold, italics, links and strikethrough from a web page", () => {
  const html = '<p>Some <b>bold</b>, <em>italic</em>, <del>gone</del> and <a href="https://x.org">a link</a></p>';
  assert.equal(htmlToMarkdown(html, "Some bold, italic, gone and a link"), "Some **bold**, _italic_, ~~gone~~ and [a link](https://x.org)");
});

test("headings, lists, quotes and code blocks", () => {
  const html = "<h2>Title</h2><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote><pre><code>let x = 1;\n</code></pre>";
  assert.equal(htmlToMarkdown(html, ""), "## Title\n\n- one\n- two\n\n> quoted\n\n```\nlet x = 1;\n```");
});

test("numbered and nested lists, and checklists", () => {
  const html = '<ol start="3"><li>three<ul><li>inner</li></ul></li><li>four</li></ol><ul><li><input type="checkbox" checked> done</li></ul>';
  assert.equal(htmlToMarkdown(html, ""), "3. three\n   - inner\n4. four\n\n- [x] done");
});

test("highlighted code, spans in a <pre>, is a code block", () => {
  const html = '<pre><span class="k">const</span> a = <span>1</span>;\nfoo();</pre>';
  assert.equal(htmlToMarkdown(html, "const a = 1;\nfoo();"), "```\nconst a = 1;\nfoo();\n```");
});

test("Google Docs: its wrapping <b> isn't bold, its styled spans are", () => {
  const html = '<b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:400">plain </span><span style="font-weight:700">strong</span><span style="font-style:italic"> leaning</span></p></b>';
  assert.equal(htmlToMarkdown(html, "plain strong leaning"), "plain **strong** _leaning_");
});

test("text without formatting is pasted as it is", () => {
  const html = '<div style="color:#ccc"><div><span style="color:#569cd6">const</span> a_b = 1;</div><div>foo();</div></div>';
  assert.equal(htmlToMarkdown(html, "const a_b = 1;\nfoo();"), undefined);
  assert.equal(htmlToMarkdown("", "anything"), undefined);
});

test("characters Markdown reads aren't escaped", () => {
  assert.equal(htmlToMarkdown("<p><b>file_name</b> 1. *x*</p>", "file_name 1. *x*"), "**file_name** 1. *x*");
});
