// An event in the calendar for a task with a due date: "Add to calendar" in the task editor makes an
// all day event on the due day in the chosen calendar, linked both ways (X-CIPHWREN-EVENT on
// the task, X-CIPHWREN-TASK on the event). The event follows the task: "✓ " in its title
// while it's done, its due date, and it's deleted with the task, when the box is unticked, or when
// the due date is removed. A repeating task's next time gets an event of its own when one is done.
// The day view's "Tasks due" leaves out the tasks whose event is on the day. Everything is checked
// on the server. It uses an account of its own.
const { launch, session, run, check, unique, newAccount, waitFor, collectionOf, Etebase } = require("../lib");

const types = { calendar: "etebase.vevent", tasks: "etebase.vtodo" };
const pad = (x) => String(x).padStart(2, "0");
const icalDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The contents of the (not deleted) items of a collection on the server, unfolded
async function contents(etebase, col) {
  const items = await etebase.getCollectionManager().getItemManager(col).list({ limit: 200 });
  return Promise.all(items.data.filter((x) => !x.isDeleted).map(async (x) => (await x.getContent(Etebase.OutputFormat.String)).replace(/\r\n[ \t]/g, "")));
}

const prop = (content, name) => content?.match(new RegExp(`\\r\\n${name}[;:](.*)\\r\\n`))?.[1];
const uidOf = (content) => prop(content, "UID");

run(async () => {
  const n = unique();
  const account = await newAccount("desktop-taskev");
  const { etebase } = account;
  const b = await launch();
  const A = await session(b, "A", { width: 1440, height: 900 });
  const { p, vis, btn, wait } = A;
  const sidebar = p.locator('[data-testid="sidebar"] >> visible=true');
  const side = (label) => sidebar.getByRole("button", { name: label, exact: true });
  await A.login(account);
  await btn(/^finish$/i).click(); await wait(6000);
  const myCalendar = await collectionOf(etebase, types.calendar);
  const taskList = await collectionOf(etebase, types.tasks);
  // A second calendar, to choose
  const colMgr = etebase.getCollectionManager();
  const work = await colMgr.create(types.calendar, { name: `Work ${n}`, color: "#3F51B5" }, "");
  await colMgr.upload(work);

  const now = new Date();
  const day = (k) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
  const task = async (title) => (await contents(etebase, taskList)).find((x) => x.includes(`\r\nSUMMARY:${title}\r\n`));
  const eventsIn = (col) => contents(etebase, col);
  // The event (in any of the two calendars) that's linked to the task with this UID
  const eventOf = async (taskUid) => {
    for (const [name, col] of [["my", myCalendar], ["work", work]]) {
      const found = (await eventsIn(col)).find((x) => prop(x, "X-CIPHWREN-TASK") === taskUid);
      if (found) {
        return { calendar: name, content: found };
      }
    }
    return undefined;
  };

  // A new task with a due date, added to the second calendar
  await side("Tasks").click(); await wait(2500);
  await btn(/^sync$/i).click(); await wait(4000);
  await btn(/^new task$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Pay rent ${n}`);
  check("no calendar box without a due date", await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").count() === 0);
  await vis('input[aria-label="Due date"]').fill(isoDate(day(1))); await wait(300);
  await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").click(); await wait(300);
  check("ticked, it offers the calendars, the first one chosen", await btn(/^calendar: my calendar$/i).count() === 1, await A.text());
  await btn(/^calendar: my calendar$/i).click(); await wait(300);
  await p.getByRole("menuitem", { name: `Work ${n}` }).locator("visible=true").first().click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);

  let rent, rentEvent;
  check("the task and its event are linked both ways on the server, the event all day on the due day in the chosen calendar", await waitFor(async () => {
    rent = await task(`Pay rent ${n}`);
    rentEvent = rent && await eventOf(uidOf(rent));
    return !!rentEvent && (rentEvent.calendar === "work") && (prop(rent, "X-CIPHWREN-EVENT") === uidOf(rentEvent.content)) &&
      rentEvent.content.includes(`\r\nSUMMARY:Pay rent ${n}\r\n`) && rentEvent.content.includes(`\r\nDTSTART;VALUE=DATE:${icalDate(day(1))}\r\n`) &&
      rentEvent.content.includes(`\r\nDTEND;VALUE=DATE:${icalDate(day(2))}\r\n`) && !rentEvent.content.includes("BEGIN:VALARM");
  }), [rent, rentEvent?.content]);
  const rentUid = uidOf(rent);

  // Done and undone
  await p.getByRole("checkbox", { name: `Done: Pay rent ${n}` }).click(); await wait(1500);
  check("done, the event's title says so", await waitFor(async () => prop((await eventOf(rentUid))?.content, "SUMMARY") === `✓ Pay rent ${n}`));
  await p.getByRole("button", { name: "Undo" }).click(); await wait(1500);
  check("undone, it's back", await waitFor(async () => prop((await eventOf(rentUid))?.content, "SUMMARY") === `Pay rent ${n}`));

  // The due date changed in the editor moves the event
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  const details = p.locator('[data-testid="task-details"] >> visible=true');
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  check("the editor of a task with an event has the box ticked, with its calendar", (await p.getByRole("checkbox", { name: "Add to calendar", checked: true }).locator("visible=true").count() === 1) &&
    (await btn(new RegExp(`^calendar: work ${n}$`, "i")).count() === 1), await A.text());
  await vis('input[aria-label="Due date"]').fill(isoDate(day(2))); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("a new due date moves the event", await waitFor(async () => {
    const e = await eventOf(rentUid);
    return !!e && e.content.includes(`\r\nDTSTART;VALUE=DATE:${icalDate(day(2))}\r\n`) && (uidOf(e.content) === uidOf(rentEvent.content));
  }));

  // A task of another app due on the same day, without an event
  const bankUid = `bank-${n}`;
  const taskMgr = colMgr.getItemManager(taskList);
  await taskMgr.batch([await taskMgr.create({ name: bankUid, mtime: Date.now() }, ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e", "BEGIN:VTODO",
    `UID:${bankUid}`, "DTSTAMP:20261001T000000Z", `SUMMARY:Call bank ${n}`, `DUE;VALUE=DATE:${icalDate(day(2))}`, "STATUS:NEEDS-ACTION",
    "END:VTODO", "END:VCALENDAR", ""].join("\r\n"))]);

  // The day view: the event is there, and "Tasks due" lists only the task without one
  await side("Calendar").click(); await wait(2500);
  await btn(/^sync$/i).click(); await wait(5000);
  await btn(/^day view$/i).click(); await wait(1500);
  await btn(/^today$/i).click(); await wait(500);
  await btn(/^next day$/i).click(); await wait(500);
  await btn(/^next day$/i).click(); await wait(1500);
  check("the day view shows the task's event", await p.getByRole("button", { name: `Event Pay rent ${n}, all day`, exact: true }).locator("visible=true").count() === 1, await A.text());
  const due = p.locator('[data-testid="tasks-due"] >> visible=true');
  check("and Tasks due lists the other task, not the one with the event", (await due.innerText()).includes(`Call bank ${n}`) && !(await due.innerText()).includes(`Pay rent ${n}`), await due.innerText());

  // An existing task gets an event when it's ticked in the editor
  await side("Tasks").click(); await wait(2500);
  await p.getByRole("button", { name: `Task Call bank ${n}` }).click(); await wait(1500);
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  let bankEvent;
  check("an existing task ticked in the editor gets an event, in the first calendar, and keeps its other app's UID", await waitFor(async () => {
    bankEvent = await eventOf(bankUid);
    return !!bankEvent && (bankEvent.calendar === "my") && (prop(await task(`Call bank ${n}`), "X-CIPHWREN-EVENT") === uidOf(bankEvent.content));
  }), bankEvent?.content);

  // The due date removed: the event is gone, and so is the link
  await p.getByRole("button", { name: `Task Call bank ${n}` }).click(); await wait(1500);
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await p.getByText("Clear", { exact: true }).locator("visible=true").first().click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("without a due date the event is deleted, and the task has no link", await waitFor(async () => !(await eventOf(bankUid)) &&
    !(await eventsIn(myCalendar)).some((x) => x.includes(`SUMMARY:Call bank ${n}`)) && !(await task(`Call bank ${n}`)).includes("X-CIPHWREN-EVENT")));

  // Unticked in the editor: the event is gone, and the link
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("unticked, the event is deleted and the task has no link", await waitFor(async () => !(await eventOf(rentUid)) &&
    !(await eventsIn(work)).some((x) => x.includes(`Pay rent ${n}`)) && !(await task(`Pay rent ${n}`)).includes("X-CIPHWREN-EVENT")));

  // Ticked again, then the task deleted: its event is deleted too
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  check("ticked again, it has an event", await waitFor(async () => !!(await eventOf(rentUid))));
  await p.getByRole("button", { name: `Task Pay rent ${n}` }).click(); await wait(1500);
  await details.getByRole("button", { name: "Edit task" }).click(); await wait(2000);
  await btn(/^delete$/i).click(); await wait(800);
  await p.getByRole("button", { name: /^ok$/i }).locator("visible=true").first().click(); await wait(3000);
  check("deleting the task deletes its event", await waitFor(async () => !(await task(`Pay rent ${n}`)) && !(await eventOf(rentUid)) &&
    !(await eventsIn(myCalendar)).some((x) => x.includes(`Pay rent ${n}`))));

  // A repeating task: the next time gets an event of its own when one is done
  await btn(/^new task$/i).click(); await wait(2000);
  await vis('input[aria-label="Title"]').fill(`Water plants ${n}`);
  await vis('input[aria-label="Due date"]').fill(isoDate(day(1))); await wait(300);
  await btn(/^repeat weekly$/i).click(); await wait(300);
  await p.getByRole("checkbox", { name: "Add to calendar" }).locator("visible=true").click(); await wait(300);
  await btn(/^save$/i).click(); await wait(3000);
  let water;
  check("a repeating task has one event", await waitFor(async () => {
    water = await task(`Water plants ${n}`);
    return !!water && !!(await eventOf(uidOf(water)));
  }));
  const waterUid = uidOf(water);
  await p.getByRole("checkbox", { name: `Done: Water plants ${n}` }).click(); await wait(3000);
  let next, nextEvent;
  check("done, its event says so, and the next time has an event of its own a week later", await waitFor(async () => {
    const all = (await contents(etebase, taskList)).filter((x) => x.includes(`SUMMARY:Water plants ${n}`));
    next = all.find((x) => uidOf(x) !== waterUid);
    nextEvent = next && await eventOf(uidOf(next));
    const doneEvent = await eventOf(waterUid);
    return !!doneEvent && (prop(doneEvent.content, "SUMMARY") === `✓ Water plants ${n}`) && !!nextEvent && (nextEvent.calendar === "my") &&
      (prop(nextEvent.content, "SUMMARY") === `Water plants ${n}`) && nextEvent.content.includes(`\r\nDTSTART;VALUE=DATE:${icalDate(day(8))}\r\n`) &&
      (prop(next, "X-CIPHWREN-EVENT") === uidOf(nextEvent.content)) && (uidOf(nextEvent.content) !== uidOf(doneEvent.content));
  }), [next, nextEvent?.content]);
  check("two events for the two times, no more", (await eventsIn(myCalendar)).filter((x) => x.includes(`Water plants ${n}`)).length === 2);

  await b.close();
});
