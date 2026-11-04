// Fills an account on the test server with sample data to try the app with: notebooks and notes,
// a calendar with events around today, a task list, an address book and bookmarks. Creates the
// account if it doesn't exist (E2E_USER / E2E_PASSWORD, like the tests). Run it once per account:
// running it again adds the data again.
//
//   E2E_USER=aio-tester E2E_PASSWORD=aio-tester-password node seed.js
const { config, Etebase, api } = require("./lib");

const pad = (x) => String(x).padStart(2, "0");
// A day from today, and a time on it in UTC (e.g. day(1) is tomorrow)
const day = (offset) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
const date = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const at = (offset, hour, minute = 0) => `${date(day(offset))}T${pad(hour)}${pad(minute)}00Z`;
const stamp = `DTSTAMP:${at(0, 0)}`;
const calendar = (lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//etesync-aio seed", ...lines, "END:VCALENDAR", ""].join("\r\n");

const notes = {
  "Personal": [
    ["Welcome", "# Welcome\n\nThis is **sample data** to try the app with.\n\n- Notes are _Markdown_\n- [ ] Tick this task\n- [x] Already done\n\n> Quotes, `code` and [links](https://github.com/nikossvnk/etesync-aio) work too.", true],
    ["Groceries", "- [ ] Milk\n- [ ] Bread\n- [x] Coffee\n- [ ] Apples\n- [ ] Olive oil"],
    ["Books to read", "1. The Left Hand of Darkness\n2. Piranesi\n3. A Psalm for the Wild-Built\n\n~~Dune~~ (read it)"],
    ["Trip ideas", "## Summer\n\n- Crete, the south coast\n- Hiking in the Dolomites\n\n## Weekend\n\n- Spreewald by canoe"],
  ],
  "Work": [
    ["Meeting notes", "## Weekly sync\n\n**Decisions**\n\n- Release on Friday\n- Move the planning to Monday\n\n**Follow-ups**\n\n- [ ] Send the summary\n- [ ] Update the roadmap", true],
    ["Snippets", "Restart the service:\n\n```\nsystemctl --user restart etesync-desktop\n```\n\nCheck its status with `--status`."],
    ["Project plan", "| Phase | When | Who |\n|---|---|---|\n| Design | March | Ana |\n| Build | April | Ben |\n| Launch | May | All |"],
  ],
};

const events = [
  ["Team standup", [`DTSTART:${at(0, 8)}`, `DTEND:${at(0, 8, 15)}`, "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "LOCATION:Video call"]],
  ["Lunch with Maria", [`DTSTART:${at(0, 11)}`, `DTEND:${at(0, 12)}`, "LOCATION:Café Central"]],
  ["Dentist", [`DTSTART:${at(1, 14)}`, `DTEND:${at(1, 14, 45)}`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Dentist", "TRIGGER:-PT30M", "END:VALARM"]],
  ["Project review", [`DTSTART:${at(2, 13)}`, `DTEND:${at(2, 15)}`, "DESCRIPTION:Go through the plan and the open issues"]],
  ["Yoga", [`DTSTART:${at(-1, 17)}`, `DTEND:${at(-1, 18)}`, "RRULE:FREQ=WEEKLY;COUNT=10"]],
  ["Conference", [`DTSTART;VALUE=DATE:${date(day(5))}`, `DTEND;VALUE=DATE:${date(day(8))}`, "LOCATION:Berlin"]],
  ["Mum's birthday", [`DTSTART;VALUE=DATE:${date(day(10))}`, `DTEND;VALUE=DATE:${date(day(11))}`, "RRULE:FREQ=YEARLY"]],
  ["Movie night", [`DTSTART:${at(-3, 19)}`, `DTEND:${at(-3, 21, 30)}`]],
];

const tasks = [
  ["Pay the rent", [`DUE;VALUE=DATE:${date(day(-1))}`, "PRIORITY:1"]],
  ["Call the plumber", [`DUE:${at(0, 15)}`, "PRIORITY:5"]],
  ["Renew passport", [`DUE;VALUE=DATE:${date(day(3))}`, "PRIORITY:1"]],
  ["Write the blog post", [`DUE;VALUE=DATE:${date(day(7))}`, "PRIORITY:9", "DESCRIPTION:About the trip to Crete"]],
  ["Clean the garage", []],
  ["Buy a present", [`DUE;VALUE=DATE:${date(day(9))}`]],
  ["Book the flights", ["STATUS:COMPLETED", `COMPLETED:${at(-1, 10)}`, "PERCENT-COMPLETE:100"]],
];

const contacts = [
  ["Maria Papadopoulou", ["N:Papadopoulou;Maria;;;", "EMAIL:maria@example.com", "TEL;TYPE=cell:+30 690 000 0001", "ORG:Acme", `BDAY:1990${date(day(10)).slice(4)}`]],
  ["Ben Schmidt", ["N:Schmidt;Ben;;;", "EMAIL:ben@example.com", "ORG:Acme", "TITLE:Engineer"]],
  ["Ana García", ["N:García;Ana;;;", "EMAIL:ana@example.com", "TEL;TYPE=work:+34 600 000 002", "ADR;TYPE=home:;;Calle Mayor 1;Madrid;;28013;Spain"]],
  ["Dr. Lee (dentist)", ["N:Lee;;;Dr.;", "TEL;TYPE=work:+49 30 0000003", "NOTE:Appointments by phone"]],
  ["Sam Okafor", ["N:Okafor;Sam;;;", "EMAIL:sam@example.com"]],
];

const bookmarks = [
  ["EteSync", "https://www.etesync.com/", "End-to-end encrypted sync", ["sync", "privacy"]],
  ["etesync-aio on GitHub", "https://github.com/nikossvnk/etesync-aio", "This app", ["dev"]],
  ["MDN Web Docs", "https://developer.mozilla.org/", "", ["dev", "reference"]],
  ["Spreewald", "https://en.wikipedia.org/wiki/Spreewald", "Weekend trip idea", ["travel"]],
  ["Markdown guide", "https://www.markdownguide.org/basic-syntax/", "", ["reference"]],
];

async function account() {
  try {
    return await api.login();
  } catch (e) {
    if (!(e instanceof Etebase.UnauthorizedError) && !(e instanceof Etebase.NotFoundError)) {
      throw e;
    }
    console.log(`Creating the account ${config.username}`);
    return Etebase.Account.signup({ username: config.username, email: `${config.username}@example.invalid` }, config.password, config.serverUrl);
  }
}

async function collection(etebase, type, meta, items) {
  const colMgr = etebase.getCollectionManager();
  const col = await colMgr.create(type, { mtime: Date.now(), ...meta }, "");
  await colMgr.upload(col);
  const itemMgr = colMgr.getItemManager(col);
  await itemMgr.batch(await Promise.all(items.map(([itemMeta, content]) => itemMgr.create({ mtime: Date.now(), ...itemMeta }, content))));
  console.log(`${meta.name}: ${items.length}`);
}

(async () => {
  const etebase = await account();
  const uid = (prefix, i) => `seed-${prefix}-${Date.now()}-${i}`;
  for (const [notebook, list] of Object.entries(notes)) {
    await collection(etebase, "etebase.md.note", { name: notebook, color: (notebook === "Work") ? "#3d7ad6ff" : "#2e9e6bff" },
      list.map(([name, content, pinned]) => [{ name, ...((pinned) ? { pinned: true } : {}) }, content]));
  }
  await collection(etebase, "etebase.vevent", { name: "Calendar", color: "#d6553dff" }, events.map(([title, lines], i) => {
    const id = uid("event", i);
    return [{ name: id }, calendar(["BEGIN:VEVENT", `UID:${id}`, stamp, `SUMMARY:${title}`, ...lines, "END:VEVENT"])];
  }));
  await collection(etebase, "etebase.vtodo", { name: "Tasks", color: "#8a5ad6ff" }, tasks.map(([title, lines], i) => {
    const id = uid("task", i);
    return [{ name: id }, calendar(["BEGIN:VTODO", `UID:${id}`, stamp, `SUMMARY:${title}`, ...lines, "END:VTODO"])];
  }));
  await collection(etebase, "etebase.vcard", { name: "Contacts", color: "#d6a13dff" }, contacts.map(([name, lines], i) => {
    const id = uid("contact", i);
    return [{ name: id }, ["BEGIN:VCARD", "VERSION:4.0", `UID:${id}`, `FN:${name}`, ...lines, "END:VCARD", ""].join("\r\n")];
  }));
  await collection(etebase, "etebase.bookmark", { name: "Bookmarks" }, bookmarks.map(([name, url, description, tags], i) => {
    const created = Date.now() - i * 86400000;
    return [{ name, url, description, tags, created, mtime: created, savedFrom: "computer" }, url];
  }));
  await etebase.logout();
  console.log(`Seeded ${config.username} on ${config.serverUrl}`);
})().catch((e) => { console.log("FAILED", e); process.exit(1); });
