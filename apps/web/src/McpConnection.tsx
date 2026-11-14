import { agentTools, type Editor } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { connectMcp, type McpStatus } from "./mcp-client.ts";

/** Whether TripReplay connects to the MCP server; off unless the user turned it on (ADR 0012). */
const MCP_KEY = "tripreplay.mcp";
/** The pairing code the user entered, so that it is asked only once in this browser. */
const MCP_CODE_KEY = "tripreplay.mcpCode";

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable, for example in a private window; the choice then lasts for this visit.
  }
}

const STATUS_TEXT = {
  waiting: "mcp.waiting",
  connected: "mcp.connected",
  wrongCode: "mcp.wrongCode",
  replaced: "mcp.replaced",
} as const;

export interface McpConnectionProps {
  readonly editor: Editor;
  readonly newId: () => string;
  readonly t: Translate;
}

/**
 * The **MCP** button of the workspace bar and what it opens: it connects the open trip to the
 * TripReplay MCP server on this computer (docs/adr/0012-mcp-server.md), asking first for the
 * pairing code that the agent tells the user. Off until the user turns it on.
 */
export function McpConnection({ editor, newId, t }: McpConnectionProps) {
  const [on, setOn] = useState(() => stored(MCP_KEY) === "true");
  const [code, setCode] = useState(() => stored(MCP_CODE_KEY) ?? "");
  const [entry, setEntry] = useState("");
  const [status, setStatus] = useState<McpStatus | undefined>();
  const codeId = useId();
  const tools = useMemo(
    () =>
      agentTools({ project: () => editor.getState().project, dispatch: (command) => editor.dispatch(command), newId }),
    [editor, newId],
  );

  useEffect(() => {
    if (!on || !code) return;
    const connection = connectMcp(code, () => tools, setStatus);
    return () => {
      connection.close();
      setStatus(undefined);
    };
  }, [on, code, tools]);

  const turn = (next: boolean) => {
    setOn(next);
    store(MCP_KEY, String(next));
  };
  const pair = (event: FormEvent) => {
    event.preventDefault();
    const value = entry.replace(/\s/g, "");
    if (!/^\d{6}$/.test(value)) return;
    setCode(value);
    store(MCP_CODE_KEY, value);
    setEntry("");
  };
  const asking = on && (!code || status === "wrongCode");

  return (
    <>
      <button type="button" className="header-button" aria-pressed={on} title={t("mcp.hint")} onClick={() => turn(!on)}>
        {t("mcp.button")}
      </button>
      {on && (
        <div className="mcp-panel" role="status">
          {asking ? (
            <form className="mcp-pair" onSubmit={pair}>
              <label htmlFor={codeId}>{t(status === "wrongCode" ? "mcp.wrongCode" : "mcp.askCode")}</label>
              <input
                id={codeId}
                inputMode="numeric"
                autoComplete="off"
                maxLength={7}
                placeholder="123456"
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
              />
              <button type="submit" className="header-button" disabled={!/^\d{6}$/.test(entry.replace(/\s/g, ""))}>
                {t("mcp.pair")}
              </button>
            </form>
          ) : (
            <span>{status ? t(STATUS_TEXT[status]) : t("mcp.waiting")}</span>
          )}
          {code && !asking && (
            <button
              type="button"
              className="mcp-link"
              onClick={() => {
                setCode("");
                store(MCP_CODE_KEY, null);
              }}
            >
              {t("mcp.forget")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
