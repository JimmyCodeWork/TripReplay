import { type PlaceMatch, type PlaceSearch, parseLocation } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { useEffect, useId, useState } from "react";
import styles from "./PlaceSearchBox.module.css";

export interface PlaceSearchBoxProps {
  readonly search: PlaceSearch;
  readonly t: Translate;
  /** Called with the chosen place; `name` is empty for bare coordinates. */
  readonly onSelect: (place: { readonly location: LonLat; readonly name: string }) => void;
}

type Results =
  | { readonly kind: "none" }
  | { readonly kind: "places"; readonly places: readonly PlaceMatch[] }
  | { readonly kind: "coordinates"; readonly location: LonLat; readonly name: string }
  | { readonly kind: "shortLink" };

type LonLat = PlaceMatch["location"];

/** Coordinates to five decimals (about 1 m), as text so that number formatting does not shorten them. */
const coordinate = (value: number) => String(Math.round(value * 1e5) / 1e5);

/**
 * Finds a place in the downloaded maps, or reads pasted coordinates and map links
 * (ADR 0006, decision 4). Nothing leaves the device.
 */
export function PlaceSearchBox({ search, t, onSelect }: PlaceSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ kind: "none" });
  const listId = useId();

  useEffect(() => {
    const text = query.trim();
    if (text === "") {
      setResults({ kind: "none" });
      return;
    }
    const pasted = parseLocation(text);
    if (pasted.kind === "location") {
      setResults({ kind: "coordinates", location: pasted.location, name: pasted.name ?? "" });
      return;
    }
    if (pasted.kind === "shortLink") {
      setResults({ kind: "shortLink" });
      return;
    }
    let current = true;
    void search.search(text, 8).then((places) => {
      if (current) setResults({ kind: "places", places });
    });
    return () => {
      current = false;
    };
  }, [query, search]);

  const choose = (location: LonLat, name: string) => {
    onSelect({ location, name });
    setQuery("");
  };

  return (
    <div className={styles.box}>
      <input
        className={styles.input}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("search.label")}
        aria-label={t("search.label")}
        aria-controls={listId}
      />
      <ul id={listId} className={styles.results}>
        {results.kind === "shortLink" && <li className={styles.note}>{t("search.shortLink")}</li>}
        {results.kind === "coordinates" && (
          <li>
            <button type="button" className={styles.result} onClick={() => choose(results.location, results.name)}>
              <span className={styles.label}>
                {results.name ||
                  t("search.coordinates", {
                    lat: coordinate(results.location.lat),
                    lon: coordinate(results.location.lon),
                  })}
              </span>
            </button>
          </li>
        )}
        {results.kind === "places" && results.places.length === 0 && (
          <li className={styles.note}>{t("search.noResults")}</li>
        )}
        {results.kind === "places" &&
          results.places.map((place) => (
            <li key={`${place.label}|${place.location.lon}|${place.location.lat}`}>
              <button type="button" className={styles.result} onClick={() => choose(place.location, place.label)}>
                <span className={styles.label}>{place.label}</span>
                {place.name !== place.label && <span className={styles.secondary}>{place.name}</span>}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
