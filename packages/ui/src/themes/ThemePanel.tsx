import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { MessageKey, Translate } from "@tripreplay/i18n";
import { builtinThemes, type Theme } from "@tripreplay/themes";
import { useId } from "react";
import styles from "./ThemePanel.module.css";

type Project = EditorState["project"];

export interface ThemePanelProps {
  readonly project: Project;
  readonly dispatch: (command: Command) => DispatchResult;
  readonly t: Translate;
}

/** A small picture of a theme: its map colors, route, markers and title, in its preferred shape. */
function ThemePreview({ theme }: { readonly theme: Theme }) {
  const portrait = theme.preferredAspectRatio === "9:16";
  const [w, h] = portrait ? [54, 96] : [160, 90];
  const route = portrait ? "M10 78 L24 58 L40 66 L46 40" : "M18 70 L58 48 L98 60 L140 30";
  const stops = portrait
    ? [
        [10, 78],
        [24, 58],
        [40, 66],
        [46, 40],
      ]
    : [
        [18, 70],
        [58, 48],
        [98, 60],
        [140, 30],
      ];
  return (
    <svg className={styles.preview} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ aspectRatio: `${w} / ${h}` }}>
      <rect width={w} height={h} fill={theme.map.land} />
      <path
        d={
          portrait
            ? `M0 ${h * 0.75} Q${w / 2} ${h * 0.6} ${w} ${h * 0.82} V${h} H0Z`
            : `M0 ${h * 0.8} Q${w / 2} ${h * 0.62} ${w} ${h * 0.85} V${h} H0Z`
        }
        fill={theme.map.water}
      />
      <rect x={w * 0.62} y={h * 0.08} width={w * 0.3} height={h * 0.22} rx={2} fill={theme.map.park} />
      {theme.route.glow && (
        <path
          d={route}
          fill="none"
          stroke={theme.route.glow}
          strokeOpacity={0.35}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={route}
        fill="none"
        stroke={theme.route.color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {stops.map(([x, y], i) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={3.2}
          fill={i < 3 ? theme.marker.visited : theme.marker.upcoming}
          stroke={theme.marker.outline}
          strokeWidth={1}
        />
      ))}
      <text
        x={w / 2}
        y={portrait ? h * 0.17 : h * 0.3}
        textAnchor="middle"
        fontSize={portrait ? 9 : 14}
        fontWeight={theme.typography.titleWeight}
        fill={theme.text.color}
        style={{
          fontFamily: theme.typography.fontFamily,
          paintOrder: "stroke",
          stroke: theme.text.shadow,
          strokeWidth: 2,
        }}
      >
        Aa 旅行
      </text>
    </svg>
  );
}

/**
 * The themes tab (docs/ui-design.md §3.3, §7): a card per bundled theme with a small preview.
 * Choosing one applies it at once; the portrait theme also switches the recap to 9:16.
 */
export function ThemePanel({ project, dispatch, t }: ThemePanelProps) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t("themes.title")}
      </h2>
      <p className={styles.intro}>{t("themes.intro")}</p>
      <ul className={styles.cards}>
        {builtinThemes.map((theme) => {
          const selected = project.trip.themeId === theme.id;
          return (
            <li key={theme.id}>
              <button
                type="button"
                className={styles.card}
                aria-pressed={selected}
                onClick={() => {
                  if (selected) return;
                  dispatch({
                    type: "chooseTheme",
                    themeId: theme.id,
                    ...(theme.preferredAspectRatio === "9:16" ? { aspectRatio: "9:16" as const } : {}),
                  });
                }}
              >
                <ThemePreview theme={theme} />
                <span className={styles.name}>{t(theme.nameKey as MessageKey)}</span>
                <span className={styles.description}>{t(theme.descriptionKey as MessageKey)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
