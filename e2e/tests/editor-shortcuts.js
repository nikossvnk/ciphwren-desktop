// In the editor, the formatting bar's buttons have keyboard shortcuts (ctrl+B for bold, …) that undo
// takes back; "`" puts the selection in code instead of typing over it; and text pasted with its
// formatting (from a web page) is put in as Markdown
const { launch, session, run, check, api, unique } = require("../lib");
run(async () => {
  const n = unique();
  const name = "Shortcuts " + n;
  await api.addNote("My Notes", name, "make this bold\nsecond line");
  const b = await launch();
  const A = await session(b, "wide", { width: 1280, height: 800 });
  await A.login();
  const textarea = A.p.locator('textarea[aria-label="Content"] >> visible=true');
  const select = (from, to) => textarea.evaluate((el, [a, b]) => { el.focus(); el.setSelectionRange(a, b); }, [from, to]);
  const selected = () => textarea.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
  const value = () => textarea.inputValue();

  await A.open(name);
  await A.p.locator('[data-testid="note-viewer"] >> text=make this bold').first().click(); await A.wait(1500);

  await select(5, 9);
  await A.p.keyboard.press("Control+b"); await A.wait(300);
  check("ctrl+B makes the selection bold", (await value()).startsWith("make **this** bold") && (await selected()) === "this", await value());
  await A.p.keyboard.press("Control+z"); await A.wait(300);
  check("undo takes it back", (await value()).startsWith("make this bold"), await value());
  await select(5, 9);
  await A.p.keyboard.press("Control+i"); await A.wait(300);
  check("ctrl+I makes it italic", (await value()).startsWith("make _this_ bold"), await value());
  await A.p.keyboard.press("Control+i"); await A.wait(300);
  check("and again takes it away", (await value()).startsWith("make this bold"), await value());

  const second = (await value()).indexOf("second line");
  await select(second, second);
  await A.p.keyboard.press("Control+Shift+Digit8"); await A.wait(300);
  check("ctrl+shift+8 makes a bulleted list", (await value()).endsWith("\n- second line"), await value());

  await select(10, 14);
  await A.p.keyboard.type("`"); await A.wait(300);
  check("` puts the selection in code", (await value()).startsWith("make this `bold`") && (await selected()) === "bold", await value());
  await select(14, 14);
  await A.p.keyboard.type("`"); await A.wait(300);
  check("without a selection ` is typed", (await value()).startsWith("make this `bol`d`"), await value());
  await A.p.keyboard.press("Control+z"); await A.wait(300);

  // A paste with formatting, at the end
  const end = (await value()).length;
  await select(end, end);
  await textarea.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/html", "<h2>Pasted</h2><p>with <strong>bold</strong> and <code>code</code></p><blockquote><p>a quote</p></blockquote>");
    data.setData("text/plain", "Pasted\nwith bold and code\na quote");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await A.wait(300);
  check("formatted text is pasted as Markdown", (await value()).endsWith("\n- second line## Pasted\n\nwith **bold** and `code`\n\n> a quote"), JSON.stringify(await value()));

  await A.back(); await A.wait(6000);
  const saved = await api.noteContent("My Notes", name);
  check("it's all saved", saved === "make this `bold`\n- second line## Pasted\n\nwith **bold** and `code`\n\n> a quote", JSON.stringify(saved));
  await A.ctx.close();
  await b.close();
});
