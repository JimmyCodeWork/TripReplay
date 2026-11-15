import type { MessageKey, Translate } from "@tripreplay/i18n";
import { type ReactNode, useId, useState } from "react";
import styles from "./SettingsPanel.module.css";

/** The settings the panel shows; the shell keeps them (docs/ui-design.md §2.2). */
export interface SettingsValues {
  readonly reducedMotion: boolean;
  readonly preloadMap: boolean;
  /** Within how many kilometres of a stop the detailed map is loaded first; undefined for the whole path. */
  readonly preloadNearKm: number | undefined;
  readonly shrinkPhotos: boolean;
  readonly shrinkVideos: boolean;
  readonly agentTools: boolean;
  readonly mcp: boolean;
}

export interface SettingsPanelProps {
  readonly values: SettingsValues;
  readonly onChange: (changes: Partial<SettingsValues>) => void;
  /** The distances offered for `preloadNearKm`, in kilometres. */
  readonly nearKmChoices: readonly number[];
  /** Which settings this device or browser offers; the others are left out. */
  readonly offers: {
    readonly shrinkVideos: boolean;
    readonly agentTools: boolean;
    readonly mcp: boolean;
  };
  /** Forgets the MCP pairing code; shown while one is kept. */
  readonly onForgetMcpCode?: (() => void) | undefined;
  readonly t: Translate;
}

/** A small "?" for an explanation or "!" for a caution, which shows its text under the setting. */
function Note({ kind, name, text, t }: { kind: "help" | "caution"; name: string; text: string; t: Translate }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = t(kind === "help" ? "settings.help" : "settings.caution", { name });
  return (
    <>
      <button
        type="button"
        className={kind === "help" ? styles.help : styles.caution}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {kind === "help" ? "?" : "!"}
      </button>
      {open && (
        <p id={id} className={kind === "help" ? styles.helpText : styles.cautionText}>
          {text}
        </p>
      )}
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {note}
    </div>
  );
}

/**
 * The Settings dialog's content (docs/ui-design.md §2.2): the choices that apply to every trip,
 * grouped into playback and map, import, and AI agents. Each setting with something to explain has a
 * "?", and each with a cost or a consequence to know has a "!", which shows the text under it.
 */
export function SettingsPanel({ values, onChange, nearKmChoices, offers, onForgetMcpCode, t }: SettingsPanelProps) {
  const nearId = useId();
  const note = (kind: "help" | "caution", name: MessageKey, text: MessageKey) => (
    <Note kind={kind} name={t(name)} text={t(text)} t={t} />
  );
  return (
    <div className={styles.panel}>
      <fieldset className={styles.section}>
        <legend>{t("settings.section.playback")}</legend>
        <Toggle
          label={t("player.reduceMotion")}
          checked={values.reducedMotion}
          onChange={(reducedMotion) => onChange({ reducedMotion })}
          note={note("help", "player.reduceMotion", "settings.reduceMotionHint")}
        />
        <Toggle
          label={t("player.preload")}
          checked={values.preloadMap}
          onChange={(preloadMap) => onChange({ preloadMap })}
          note={note("help", "player.preload", "player.preloadHint")}
        />
        <div className={styles.row}>
          <label className={styles.choice} htmlFor={nearId}>
            <span>{t("settings.preloadNear")}</span>
            <select
              id={nearId}
              value={values.preloadNearKm ?? "all"}
              disabled={!values.preloadMap}
              onChange={(event) =>
                onChange({ preloadNearKm: event.target.value === "all" ? undefined : Number(event.target.value) })
              }
            >
              {nearKmChoices.map((km) => (
                <option key={km} value={km}>
                  {t("settings.preloadNear.km", { km })}
                </option>
              ))}
              <option value="all">{t("settings.preloadNear.all")}</option>
            </select>
          </label>
          {note("caution", "settings.preloadNear", "settings.preloadNearHint")}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>{t("settings.section.import")}</legend>
        <Toggle
          label={t("media.shrinkPhotos")}
          checked={values.shrinkPhotos}
          onChange={(shrinkPhotos) => onChange({ shrinkPhotos })}
          note={note("help", "media.shrinkPhotos", "media.shrinkPhotosHint")}
        />
        {offers.shrinkVideos && (
          <Toggle
            label={t("media.shrinkVideos")}
            checked={values.shrinkVideos}
            onChange={(shrinkVideos) => onChange({ shrinkVideos })}
            note={note("caution", "media.shrinkVideos", "media.shrinkVideosHint")}
          />
        )}
      </fieldset>

      {(offers.agentTools || offers.mcp) && (
        <fieldset className={styles.section}>
          <legend>{t("settings.section.agents")}</legend>
          {offers.agentTools && (
            <Toggle
              label={t("settings.agentTools")}
              checked={values.agentTools}
              onChange={(agentTools) => onChange({ agentTools })}
              note={note("caution", "settings.agentTools", "workspace.agentToolsHint")}
            />
          )}
          {offers.mcp && (
            <Toggle
              label={t("settings.mcp")}
              checked={values.mcp}
              onChange={(mcp) => onChange({ mcp })}
              note={note("caution", "settings.mcp", "mcp.hint")}
            />
          )}
          {offers.mcp && onForgetMcpCode && (
            <div className={styles.row}>
              <button type="button" className={styles.link} onClick={onForgetMcpCode}>
                {t("mcp.forget")}
              </button>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
