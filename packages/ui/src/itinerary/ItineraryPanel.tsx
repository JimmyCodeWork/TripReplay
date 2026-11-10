import type { Command, DispatchResult, EditorState, PlaceSearch } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useId, useState } from "react";
import { DayChips } from "../controls/DayChips.tsx";
import { formatDate, today } from "../format-date.ts";
import { PlaceSearchBox } from "../places/PlaceSearchBox.tsx";
import styles from "./ItineraryPanel.module.css";

type Project = EditorState["project"];
type Stop = Project["stops"][number];

export interface ItineraryPanelProps {
  readonly project: Project;
  readonly dispatch: (command: Command) => DispatchResult;
  readonly search: PlaceSearch;
  readonly newId: () => string;
  readonly selectedStopId: string | undefined;
  readonly onSelect: (stopId: string) => void;
  /** Opens the media or journal tab at a stop. */
  readonly onOpen?: ((tab: "media" | "journal", stopId: string) => void) | undefined;
  readonly locale: Locale;
  readonly t: Translate;
}

interface Day {
  readonly date: string;
  readonly stops: readonly Stop[];
}

function days(stops: readonly Stop[]): Day[] {
  const out: Day[] = [];
  for (const stop of stops) {
    const last = out.at(-1);
    if (last?.date === stop.date) out[out.length - 1] = { date: last.date, stops: [...last.stops, stop] };
    else out.push({ date: stop.date, stops: [stop] });
  }
  return out;
}

/** Where a dragged stop would go: a position within a date, and where to draw the mark. */
interface DropTarget {
  readonly date: string;
  readonly position: number;
  readonly mark: { readonly stopId: string; readonly side: "before" | "after" } | { readonly date: string };
}

/** A copy being placed: its date, and the stop it goes after, or the start of that day. */
interface Copying {
  readonly id: string;
  readonly date: string;
  readonly after: string;
}

const START = "";

/**
 * The itinerary tab (docs/ui-design.md §3.3): stops grouped by day, in order, one day at a time
 * or all together. Stops are added from place search, pasted coordinates or map links. Dragging a
 * stop's handle reorders it, also across days; the selected stop shows its actions, among them
 * opening its media or journal and copying it to a chosen place. Each change is one undoable
 * command.
 */
export function ItineraryPanel({
  project,
  dispatch,
  search,
  newId,
  selectedStopId,
  onSelect,
  onOpen,
  locale,
  t,
}: ItineraryPanelProps) {
  const [date, setDate] = useState(() => project.stops.at(-1)?.date ?? today());
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly name: string } | undefined>();
  const [copying, setCopying] = useState<Copying | undefined>();
  const [shownDay, setShownDay] = useState<string | undefined>();
  const [dragging, setDragging] = useState<{ readonly id: string; readonly target?: DropTarget } | undefined>();
  const titleId = useId();
  const dateId = useId();
  const grouped = days(project.stops);
  const shown = grouped.filter((day) => shownDay === undefined || day.date === shownDay);
  const numbers = new Map(project.stops.map((stop, index) => [stop.id, index + 1]));
  const stopsOn = (on: string, without?: string) => project.stops.filter((s) => s.date === on && s.id !== without);

  const add = ({ location, name }: { location: { lon: number; lat: number }; name: string }) => {
    const id = newId();
    const result = dispatch({
      type: "addStop",
      stop: {
        id,
        name: name || t("itinerary.unnamed", { number: project.stops.length + 1 }),
        description: "",
        date,
        location,
      },
    });
    if (result.ok) onSelect(id);
  };

  // Another visit to the same place, such as the hotel of several nights or a station passed again:
  // a copy without the journal, after the chosen stop of the chosen date or at the start of it.
  const copy = (source: Stop, place: Copying) => {
    const id = newId();
    const position = place.after === START ? 0 : stopsOn(place.date).findIndex((s) => s.id === place.after) + 1;
    const result = dispatch({
      type: "addStop",
      stop: { id, name: source.name, description: "", date: place.date, location: source.location },
      position,
    });
    if (result.ok) {
      setCopying(undefined);
      onSelect(id);
    }
  };

  const move = (dayIndex: number, index: number, step: -1 | 1) => {
    const day = grouped[dayIndex] as Day;
    const stop = day.stops[index] as Stop;
    const target = index + step;
    if (target >= 0 && target < day.stops.length) {
      dispatch({ type: "moveStop", id: stop.id, date: day.date, position: target });
      return;
    }
    // Past the edge of its day, a stop moves to the end of the previous day or the start of the next.
    const neighbor = grouped[dayIndex + step];
    if (!neighbor) return;
    dispatch({ type: "moveStop", id: stop.id, date: neighbor.date, position: step < 0 ? neighbor.stops.length : 0 });
  };

  // Dragging by the handle: the row under the pointer decides the place, its upper half before it
  // and its lower half after it; a day's heading means the start of that day.
  const targetAt = (event: ReactPointerEvent, id: string): DropTarget | undefined => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>("[data-stop]");
    if (row) {
      const over = project.stops.find((s) => s.id === row.dataset.stop);
      if (!over || over.id === id) return undefined;
      const box = row.getBoundingClientRect();
      const side = event.clientY < box.top + box.height / 2 ? "before" : "after";
      const index = stopsOn(over.date, id).findIndex((s) => s.id === over.id);
      return { date: over.date, position: side === "before" ? index : index + 1, mark: { stopId: over.id, side } };
    }
    const heading = element?.closest<HTMLElement>("[data-day]");
    const day = heading?.dataset.day;
    return day ? { date: day, position: 0, mark: { date: day } } : undefined;
  };
  const drop = () => {
    const target = dragging?.target;
    setDragging(undefined);
    if (!dragging || !target) return;
    const stop = project.stops.find((s) => s.id === dragging.id);
    if (!stop) return;
    const now = stopsOn(stop.date).findIndex((s) => s.id === stop.id);
    if (stop.date === target.date && now === target.position) return;
    dispatch({ type: "moveStop", id: stop.id, date: target.date, position: target.position });
  };
  const handle = (stop: Stop) => (
    <span
      className={styles.handle}
      title={t("itinerary.drag")}
      aria-hidden="true"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic pointer cannot be captured; the drag still follows the events it gets.
        }
        setDragging({ id: stop.id });
      }}
      onPointerMove={(event) => {
        if (dragging?.id !== stop.id) return;
        const target = targetAt(event, stop.id);
        setDragging(target ? { id: stop.id, target } : { id: stop.id });
      }}
      onPointerUp={drop}
      onPointerCancel={() => setDragging(undefined)}
    >
      ⠿
    </span>
  );
  const markOf = (stop: Stop) => {
    const mark = dragging?.target?.mark;
    if (!mark || !("stopId" in mark) || mark.stopId !== stop.id) return "";
    return mark.side === "before" ? styles.dropBefore : styles.dropAfter;
  };

  const actions = (stop: Stop, dayIndex: number, index: number, first: boolean, last: boolean): ReactNode => {
    if (renaming?.id === stop.id) {
      return (
        <form
          className={styles.rename}
          onSubmit={(event) => {
            event.preventDefault();
            if (renaming.name.trim() !== "") {
              dispatch({ type: "updateStop", id: stop.id, changes: { name: renaming.name.trim() } });
            }
            setRenaming(undefined);
          }}
        >
          <input
            aria-label={t("itinerary.rename")}
            value={renaming.name}
            onChange={(event) => setRenaming({ id: stop.id, name: event.target.value })}
            // biome-ignore lint/a11y/noAutofocus: the field appears in response to the user's request to rename.
            autoFocus
          />
          <button type="submit">{t("common.save")}</button>
          <button type="button" onClick={() => setRenaming(undefined)}>
            {t("common.cancel")}
          </button>
        </form>
      );
    }
    if (copying?.id === stop.id) {
      const sameDay = stopsOn(copying.date);
      return (
        <form
          className={styles.copy}
          aria-label={t("itinerary.copyTitle", { name: stop.name })}
          onSubmit={(event) => {
            event.preventDefault();
            copy(stop, copying);
          }}
        >
          <label>
            <span>{t("itinerary.copyDate")}</span>
            <input
              type="date"
              value={copying.date}
              required
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                // On the stop's own day the copy follows it; on another day it follows that day's last stop.
                const after = next === stop.date ? stop.id : (stopsOn(next).at(-1)?.id ?? START);
                setCopying({ id: stop.id, date: next, after });
              }}
            />
          </label>
          <label>
            <span>{t("itinerary.copyPlace")}</span>
            <select value={copying.after} onChange={(event) => setCopying({ ...copying, after: event.target.value })}>
              <option value={START}>{t("itinerary.copyAtStart")}</option>
              {sameDay.map((s) => (
                <option key={s.id} value={s.id}>
                  {t("itinerary.copyAfter", { number: numbers.get(s.id) ?? 0, name: s.name })}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t("itinerary.copy")}</button>
          <button type="button" onClick={() => setCopying(undefined)}>
            {t("common.cancel")}
          </button>
        </form>
      );
    }
    const clips = project.clips.filter((clip) => clip.stopId === stop.id).length;
    return (
      <div className={styles.actions}>
        {onOpen && (
          <>
            <button type="button" onClick={() => onOpen("media", stop.id)}>
              {t("itinerary.openMedia", { count: clips })}
            </button>
            <button type="button" onClick={() => onOpen("journal", stop.id)}>
              {t("itinerary.openJournal")}
            </button>
          </>
        )}
        <button type="button" onClick={() => setCopying({ id: stop.id, date: stop.date, after: stop.id })}>
          {t("itinerary.copy")}
        </button>
        <button type="button" onClick={() => setRenaming({ id: stop.id, name: stop.name })}>
          {t("itinerary.rename")}
        </button>
        <button type="button" onClick={() => dispatch({ type: "removeStop", id: stop.id })}>
          {t("itinerary.remove")}
        </button>
        <button
          type="button"
          aria-label={t("itinerary.moveUp")}
          title={t("itinerary.moveUp")}
          disabled={first}
          onClick={() => move(dayIndex, index, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={t("itinerary.moveDown")}
          title={t("itinerary.moveDown")}
          disabled={last}
          onClick={() => move(dayIndex, index, 1)}
        >
          ↓
        </button>
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t("itinerary.title")}
      </h2>
      <div className={styles.add}>
        <label className={styles.date} htmlFor={dateId}>
          <span>{t("itinerary.dateLabel")}</span>
          <input
            id={dateId}
            type="date"
            value={date}
            required
            onChange={(event) => event.target.value && setDate(event.target.value)}
          />
        </label>
        <PlaceSearchBox search={search} t={t} onSelect={add} known={project.stops} />
      </div>
      {project.stops.length === 0 && <p className={styles.empty}>{t("itinerary.empty")}</p>}
      <DayChips
        dates={grouped.map((day) => day.date)}
        shown={shownDay}
        onShow={(day) => {
          setShownDay(day);
          if (day) setDate(day);
        }}
        locale={locale}
        t={t}
      />
      {shown.map((day) => {
        const dayIndex = grouped.indexOf(day);
        const mark = dragging?.target?.mark;
        return (
          <div key={day.date} className={styles.day}>
            <h3
              className={`${styles.dayTitle} ${mark && "date" in mark && mark.date === day.date ? styles.dropBefore : ""}`}
              data-day={day.date}
            >
              {t("itinerary.day", { number: dayIndex + 1, date: formatDate(locale, day.date) })}
            </h3>
            <ol className={styles.stops}>
              {day.stops.map((stop, index) => {
                const first = dayIndex === 0 && index === 0;
                const last = dayIndex === grouped.length - 1 && index === day.stops.length - 1;
                const selected = stop.id === selectedStopId;
                return (
                  <li
                    key={stop.id}
                    data-stop={stop.id}
                    className={`${selected ? styles.selected : styles.stop} ${dragging?.id === stop.id ? styles.dragging : ""} ${markOf(stop)}`}
                  >
                    {handle(stop)}
                    <span className={styles.number} aria-hidden="true">
                      {numbers.get(stop.id)}
                    </span>
                    <button
                      type="button"
                      className={styles.name}
                      aria-current={selected}
                      aria-expanded={selected}
                      onClick={() => onSelect(stop.id)}
                    >
                      {stop.name}
                    </button>
                    {selected && actions(stop, dayIndex, index, first, last)}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
