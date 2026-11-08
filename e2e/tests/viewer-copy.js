// Text copied from the note viewer keeps its formatting (bold, italics, struck through, code) but not
// the colours of the theme, which pasted elsewhere would be light text on a dark background; ctrl+A
// selects the note's text (outside of text fields), so that it's copied the same way
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  const name = "Copy " + n;
  await api.addNote("My Notes", name, "# Title\n\nplain **bold** _italic_ ~~gone~~ `code`\n\n```\nline 1\nline 2\n```");
  const b = await launch();
  const A = await session(b, "dark", { width: 1280, height: 800 }, { colorScheme: "dark" });
  await A.login();
  await A.open(name);
  await A.viewerText();

  // Selects the viewer's text from the start of a text to the end of another (by what they say),
  // copies it and gives what was copied
  const copy = async (from, to) => {
    await A.p.evaluate(([from, to]) => {
      const viewer = [...document.querySelectorAll('[data-testid="note-viewer"]')].find((x) => x.offsetParent);
      const walker = document.createTreeWalker(viewer, NodeFilter.SHOW_TEXT);
      const texts = [];
      for (let x = walker.nextNode(); x; x = walker.nextNode()) {
        texts.push(x);
      }
      const start = texts.find((x) => x.textContent.includes(from));
      const end = texts.findLast((x) => x.textContent.includes(to));
      const range = document.createRange();
      range.setStart(start, start.textContent.indexOf(from));
      range.setEnd(end, end.textContent.indexOf(to) + to.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, [from, to]);
    return pressCopy();
  };
  // Copies with ctrl+C and gives what was copied
  const pressCopy = async () => {
    await A.p.evaluate(() => {
      window.copied = undefined;
      window.addEventListener("copy", (e) => {
        window.copied = { html: e.clipboardData.getData("text/html"), text: e.clipboardData.getData("text/plain") };
      }, { once: true });
    });
    await A.p.keyboard.press("Control+c"); await A.wait(300);
    return A.p.evaluate(() => window.copied);
  };

  const all = await copy("Title", "line 2");
  check("the copy has the formatted text", !!all?.html, all);
  check("without colours", !/color|background/i.test(all.html), all.html);
  check("the title is bold and bigger", /<span style="font-weight: bold; font-size: [\d.]+px">Title<\/span>/.test(all.html), all.html);
  check("bold, italics, struck through and code are kept", all.html.includes('<span style="font-weight: bold">bold</span>')
    && all.html.includes('<span style="font-style: italic">italic</span>') && all.html.includes("<s>gone</s>")
    && all.html.includes("<code>code</code>"), all.html);
  check("the code block keeps its lines", all.html.includes("<pre><code>line 1\nline 2</code></pre>"), all.html);
  check("the plain text is the text", /^Title\s+plain bold italic gone code\s+line 1\nline 2$/.test(all.text), all.text);

  const part = await copy("old", "old");
  check("a part of bold text is copied bold", part?.html === '<div style="white-space: pre-wrap"><span style="font-weight: bold">old</span></div>', part);
  check("as plain text too", part?.text === "old", part);

  // Ctrl+A selects the note's text, not the whole page
  await A.p.evaluate(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); });
  await A.p.keyboard.press("Control+a"); await A.wait(300);
  const selectAll = await pressCopy();
  check("ctrl+A selects the note's text", /^Title\s+plain bold italic gone code\s+line 1\nline 2\s*$/.test(selectAll?.text ?? ""), selectAll);
  check("which is copied without colours too", !!selectAll?.html && !/color|background/i.test(selectAll.html) && selectAll.html.includes("<pre><code>line 1"), selectAll);
  // (the sidebar's search, which is empty: typing in it opens the search)
  const field = A.p.locator('input[aria-label="Search"] >> visible=true').first();
  await field.click(); await A.wait(300);
  await A.p.keyboard.press("Control+a"); await A.wait(300);
  const inField = await A.p.evaluate(() => ({ focused: document.activeElement?.getAttribute("aria-label"), page: getSelection().toString() }));
  check("in a text field ctrl+A is the field's", (inField.focused === "Search") && !inField.page.includes("line 2"), inField);

  await A.ctx.close();
  await b.close();
});
