import type { Command, DispatchResult, EditorState, PlaceSearch } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useId, useState } from "react";
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

/**
 * The itinerary tab (docs/ui-design.md §3.3): stops grouped by day, in order. Stops are added from
 * place search, pasted coordinates or map links; each change is one undoable command.
 */
export function ItineraryPanel({
  project,
  dispatch,
  search,
  newId,
  selectedStopId,
  onSelect,
  locale,
  t,
}: ItineraryPanelProps) {
  const [date, setDate] = useState(() => project.stops.at(-1)?.date ?? today());
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly name: string } | undefined>();
  const titleId = useId();
  const dateId = useId();
  const grouped = days(project.stops);
  let number = 0;

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
        <PlaceSearchBox search={search} t={t} onSelect={add} />
      </div>
      {project.stops.length === 0 && <p className={styles.empty}>{t("itinerary.empty")}</p>}
      {grouped.map((day, dayIndex) => (
        <div key={day.date} className={styles.day}>
          <h3 className={styles.dayTitle}>
            {t("itinerary.day", { number: dayIndex + 1, date: formatDate(locale, day.date) })}
          </h3>
          <ol className={styles.stops}>
            {day.stops.map((stop, index) => {
              number++;
              const first = dayIndex === 0 && index === 0;
              const last = dayIndex === grouped.length - 1 && index === day.stops.length - 1;
              return (
                <li key={stop.id} className={stop.id === selectedStopId ? styles.selected : styles.stop}>
                  <span className={styles.number} aria-hidden="true">
                    {number}
                  </span>
                  {renaming?.id === stop.id ? (
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
                  ) : (
                    <button
                      type="button"
                      className={styles.name}
                      aria-current={stop.id === selectedStopId}
                      onClick={() => onSelect(stop.id)}
                    >
                      {stop.name}
                    </button>
                  )}
                  <span className={styles.tools}>
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
                    <button
                      type="button"
                      aria-label={t("itinerary.rename")}
                      title={t("itinerary.rename")}
                      onClick={() => setRenaming({ id: stop.id, name: stop.name })}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label={t("itinerary.remove")}
                      title={t("itinerary.remove")}
                      onClick={() => dispatch({ type: "removeStop", id: stop.id })}
                    >
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
