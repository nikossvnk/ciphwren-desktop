// SPDX-FileCopyrightText: © 2017 EteSync Authors
// SPDX-License-Identifier: AGPL-3.0-only

import ICAL from "ical.js";
import * as zoneAliases from "./data/zones.json";
import moment from "moment";
import * as uuid from "uuid";
import { vtimezoneOf } from "./timezones";

const PRODID = "-//iCal.js EteSync iOS";

// The time now, in UTC, as LAST-MODIFIED, CREATED and COMPLETED have to be (RFC 5545; ICAL.Time.now()
// is the time on this device's clock, without a time zone)
export function utcNow() {
  return ICAL.Time.fromJSDate(new Date(), true);
}

// The value of a property (or of a property's first value), when it's of the kind it has to be.
// ical.js types values as any of its kinds (and leaves out numbers, which INTEGER properties such as
// PRIORITY are), so the kind is checked here.
export function timeValue(value: unknown): ICAL.Time | undefined {
  return (value instanceof ICAL.Time) ? value : undefined;
}

export function textValue(value: unknown): string | undefined {
  return (typeof value === "string") ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return (typeof value === "number") ? value : undefined;
}

// The time zone a time is in, by its TZID. It's also there when the zone wasn't known when the time
// was read (the time is then in this device's zone): ical.js keeps the name, but its types leave it
// out.
export function tzidOf(time: ICAL.Time): string | undefined {
  return ("timezone" in time) ? textValue(time.timezone) : undefined;
}

export interface PimType {
  uid: string;
  collectionUid?: string;
  itemUid?: string;
  toIcal(): string;
  clone(): PimType;
  lastModified: ICAL.Time | undefined;
}

// The time zone of the name (one the browser knows, or another name of one, e.g. Windows'
// "W. Europe Standard Time"), made from the browser's data, or null if it isn't known
export function timezoneLoadFromName(timezone: string | null) {
  if (!timezone) {
    return null;
  }

  if (ICAL.TimezoneService.has(timezone)) {
    return ICAL.TimezoneService.get(timezone);
  }

  const aliases: { [key: string]: { aliasTo: string } } = zoneAliases.aliases;
  const component = vtimezoneOf(timezone) ?? (aliases[timezone] && vtimezoneOf(aliases[timezone].aliasTo, timezone));
  if (!component) {
    return null;
  }

  const retZone = new ICAL.Timezone({
    component,
    tzid: timezone,
  });

  ICAL.TimezoneService.register(retZone, timezone);

  return retZone;
}

function parseString(content: string) {
  content = content.replace(/^[a-zA-Z0-9]*\./gm, ""); // FIXME: ugly hack to ignore item groups.
  return new ICAL.Component(ICAL.parse(content));
}

function copyComponent(comp: ICAL.Component) {
  return ICAL.Component.fromString(comp.toString());
}

// The components of an item (an event or a task): the event itself, the times of it that were
// changed (more components with its UID and a RECURRENCE-ID), and any others, which are kept as they
// are. The event itself is the one without a RECURRENCE-ID, which doesn't have to be the first.
function splitItem(comp: ICAL.Component, name: string) {
  // The time zones of the item are used for its times when the app doesn't know them (e.g. ones
  // with a name of another app)
  for (const zone of comp.getAllSubcomponents("vtimezone")) {
    const tzid = String(zone.getFirstPropertyValue("tzid") ?? "");
    if (tzid && !timezoneLoadFromName(tzid) && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(new ICAL.Timezone(copyComponent(zone)), tzid);
    }
  }
  const all = comp.getAllSubcomponents(name);
  const main = all.find((x) => !x.hasProperty("recurrence-id")) ?? all[0] ?? null;
  const uid = main?.getFirstPropertyValue("uid");
  const exceptions = (main && !main.hasProperty("recurrence-id")) ?
    all.filter((x) => (x !== main) && x.hasProperty("recurrence-id") && (x.getFirstPropertyValue("uid") === uid)) : [];
  const others = all.filter((x) => (x !== main) && !exceptions.includes(x));
  return { main: (main) ? copyComponent(main) : null, exceptions: exceptions.map(copyComponent), others: others.map(copyComponent) };
}

export class EventType extends ICAL.Event implements PimType {
  public collectionUid?: string;
  public itemUid?: string;
  // Other components of the item (e.g. changed times without the event they belong to), which are
  // saved as they are
  public others: ICAL.Component[] = [];

  public static isEvent(comp: ICAL.Component) {
    return !!comp.getFirstSubcomponent("vevent");
  }

  public static fromVCalendar(comp: ICAL.Component) {
    const { main, exceptions, others } = splitItem(comp, "vevent");
    const event = new EventType(main ?? undefined, { exceptions });
    event.others = others;
    // FIXME: we need to clone it so it loads the correct timezone and applies it
    timezoneLoadFromName(event.timezone);
    return event.clone();
  }

  public static parse(content: string) {
    return EventType.fromVCalendar(parseString(content));
  }

  get timezone() {
    const time = this.startDate ?? this.endDate;
    return (time) ? (tzidOf(time) ?? null) : null;
  }

  get title() {
    return this.summary;
  }

  set title(title: string) {
    this.summary = title;
  }

  get start() {
    return this.startDate.toJSDate();
  }

  get end() {
    return this.endDate.toJSDate();
  }

  get allDay() {
    return this.startDate.isDate;
  }

  get desc() {
    return this.description;
  }

  get lastModified(): ICAL.Time | undefined {
    return timeValue(this.component.getFirstPropertyValue("last-modified"));
  }

  set lastModified(time: ICAL.Time) {
    this.component.updatePropertyWithValue("last-modified", time);
  }

  get rrule(): ICAL.Recur | undefined {
    const value: unknown = this.component.getFirstPropertyValue("rrule");
    return (value instanceof ICAL.Recur) ? value : undefined;
  }

  set rrule(rule: ICAL.Recur) {
    this.component.updatePropertyWithValue("rrule", rule);
  }

  // The components of the times of a repeating event (or task) that were changed
  get changedTimes(): ICAL.Component[] {
    return Object.values(this.exceptions).map((x) => x.component);
  }

  // Replaces the times that were changed (they're looked up by their RECURRENCE-ID, so this is also
  // needed after one of those is changed)
  public setChangedTimes(comps: ICAL.Component[]) {
    this.exceptions = Object.create(null);
    this.rangeExceptions = [];
    (this as any)._rangeExceptionCache = Object.create(null);
    for (const comp of comps) {
      this.relateException(comp);
    }
  }

  public toIcal() {
    const comp = new ICAL.Component(["vcalendar", [], []]);
    comp.updatePropertyWithValue("prodid", PRODID);
    comp.updatePropertyWithValue("version", "2.0");

    comp.addSubcomponent(this.component);
    for (const x of [...this.changedTimes, ...this.others]) {
      comp.addSubcomponent(x);
    }
    ICAL.helpers.updateTimezones(comp);
    return comp.toString();
  }

  public clone() {
    const ret = new EventType(copyComponent(this.component), { exceptions: this.changedTimes.map(copyComponent) });
    ret.others = this.others.map(copyComponent);
    ret.collectionUid = this.collectionUid;
    ret.itemUid = this.itemUid;
    return ret;
  }
}

export enum TaskStatusType {
  NeedsAction = "NEEDS-ACTION",
  Completed = "COMPLETED",
  InProcess = "IN-PROCESS",
  Cancelled = "CANCELLED",
}

export enum TaskPriorityType {
  Undefined = 0,
  High = 1,
  Medium = 5,
  Low = 9,
}

export class TaskType extends EventType {

  public static fromVCalendar(comp: ICAL.Component) {
    const { main, exceptions, others } = splitItem(comp, "vtodo");
    const task = new TaskType(main, { exceptions });
    task.others = others;
    // FIXME: we need to clone it so it loads the correct timezone and applies it
    timezoneLoadFromName(task.timezone);
    return task.clone();
  }

  public static parse(content: string) {
    return TaskType.fromVCalendar(parseString(content));
  }

  constructor(comp?: ICAL.Component | null, options?: { exceptions?: ICAL.Component[] }) {
    super(comp ? comp : new ICAL.Component("vtodo"), options ?? { exceptions: [] });
  }

  get finished() {
    return this.status === TaskStatusType.Completed ||
      this.status === TaskStatusType.Cancelled;
  }

  set status(status: TaskStatusType) {
    this.component.updatePropertyWithValue("status", status);
  }

  get status(): TaskStatusType | undefined {
    const value = textValue(this.component.getFirstPropertyValue("status"));
    return Object.values(TaskStatusType).find((x) => x === value);
  }

  set priority(priority: TaskPriorityType) {
    this.component.updatePropertyWithValue("priority", priority);
  }

  get priority(): number | undefined {
    return numberValue(this.component.getFirstPropertyValue("priority"));
  }

  set tags(tags: string[]) {
    const property = this.component.getFirstProperty("categories");
    const empty = tags.length === 0;
    if (property) {
      if (empty) {
        this.component.removeAllProperties("categories");
      } else {
        property.setValues(tags);
      }
    } else if (!empty) {
      const newProp = new ICAL.Property("categories", this.component);
      newProp.setValues(tags);
      this.component.addProperty(newProp);
    }
  }

  get tags() {
    return this.component.getFirstProperty("categories")?.getValues()?.filter((x) => x !== "") ?? [];
  }

  set dueDate(date: ICAL.Time | undefined) {
    if (date) {
      this.component.updatePropertyWithValue("due", date);
    } else {
      this.component.removeAllProperties("due");
    }
  }

  get dueDate() {
    return timeValue(this.component.getFirstPropertyValue("due"));
  }

  set completionDate(date: ICAL.Time | undefined) {
    if (date) {
      this.component.updatePropertyWithValue("completed", date);
    } else {
      this.component.removeAllProperties("completed");
    }
  }

  get completionDate() {
    return timeValue(this.component.getFirstPropertyValue("completed"));
  }

  set relatedTo(parentUid: string | undefined) {
    if (parentUid !== undefined) {
      this.component.updatePropertyWithValue("related-to", parentUid);
    } else {
      this.component.removeAllProperties("related-to");
    }
  }

  get relatedTo(): string | undefined {
    return textValue(this.component.getFirstPropertyValue("related-to"));
  }

  get endDate() {
    // XXX: A hack to override this as it shouldn't be used
    return undefined as any;
  }

  get allDay() {
    return !!((this.startDate?.isDate) || (this.dueDate?.isDate));
  }

  get dueToday() {
    return this.dueDate && moment(this.dueDate.toJSDate()).isSameOrBefore(moment(), "day");
  }

  get overdue() {
    if (!this.dueDate) {
      return false;
    }

    const dueDate = moment(this.dueDate.toJSDate());
    const now = moment();
    return (this.dueDate.isDate) ? dueDate.isBefore(now, "day") : dueDate.isBefore(now);
  }

  get hidden() {
    if (!this.startDate) {
      return false;
    }

    const startDate = moment(this.startDate.toJSDate());
    const now = moment();
    return startDate.isAfter(now);
  }

  public clone() {
    const ret = new TaskType(copyComponent(this.component), { exceptions: this.changedTimes.map(copyComponent) });
    ret.others = this.others.map(copyComponent);
    return ret;
  }

  public getNextOccurence(): TaskType | null {
    const rule = this.rrule;
    if (!this.isRecurring() || !rule) {
      return null;
    }

    const rrule = rule.clone();

    if (rrule.count && rrule.count <= 1) {
      return null; // end of reccurence
    }

    rrule.count = null; // clear count so we can iterate as many times as needed
    const recur = rrule.iterator(this.startDate ?? this.dueDate);
    recur.next(); // (the first time is this one's own)
    let nextRecurrence;
    while ((nextRecurrence = recur.next())) {
      if (nextRecurrence.compare(ICAL.Time.now()) > 0) {
        break;
      }
    }

    if (!nextRecurrence) {
      return null; // end of reccurence
    }

    const nextStartDate = this.startDate ? nextRecurrence : undefined;
    const nextDueDate = this.dueDate ? nextRecurrence : undefined;
    if (nextStartDate && nextDueDate) {
      const offset = this.dueDate!.subtractDateTz(this.startDate);
      nextDueDate.addDuration(offset);
    }

    // (the times of this one that were changed aren't times of the next one, which is a task of its own)
    const nextTask = this.clone();
    nextTask.setChangedTimes([]);
    nextTask.others = [];
    nextTask.uid = uuid.v4();
    if (nextStartDate) {
      nextTask.startDate = nextStartDate;
    }
    if (nextDueDate) {
      nextTask.dueDate = nextDueDate;
    }

    if (rule.count) {
      rrule.count = rule.count - 1;
      nextTask.rrule = rrule;
    }

    nextTask.status = TaskStatusType.NeedsAction;
    nextTask.lastModified = utcNow();

    return nextTask;
  }
}

export class ContactType implements PimType {
  public comp: ICAL.Component;
  public collectionUid?: string;
  public itemUid?: string;


  public static parse(content: string) {
    return new ContactType(parseString(content));
  }

  constructor(comp: ICAL.Component) {
    this.comp = comp;
  }

  public toIcal() {
    return this.comp.toString();
  }

  public clone() {
    return new ContactType(ICAL.Component.fromString(this.comp.toString()));
  }

  get uid() {
    return textValue(this.comp.getFirstPropertyValue("uid")) ?? "";
  }

  set uid(uid: string) {
    this.comp.updatePropertyWithValue("uid", uid);
  }

  get fn() {
    return textValue(this.comp.getFirstPropertyValue("fn"));
  }

  get lastModified() {
    return timeValue(this.comp.getFirstPropertyValue("rev"));
  }

  get group() {
    const kind = textValue(this.comp.getFirstPropertyValue("kind"));
    return (kind === "group") || (kind === "organization");
  }

  get members() {
    return this.comp.getAllProperties("member").map((prop) => (textValue(prop.getFirstValue()) ?? "").replace("urn:uuid:", ""));
  }
}
