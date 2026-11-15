import { agentTools, type Editor } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { connectMcp, type McpStatus } from "./mcp-client.ts";
import { updateSettings, useSettings } from "./settings.ts";

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
 * The MCP note of the workspace bar: while MCP is on in Settings, it connects the open trip to the
 * TripReplay MCP server on this computer (docs/adr/0012-mcp-server.md) and shows how the connection
 * stands, asking first for the pairing code that the agent tells the user.
 */
export function McpConnection({ editor, newId, t }: McpConnectionProps) {
  const { mcp: on, mcpCode: code } = useSettings();
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

  const pair = (event: FormEvent) => {
    event.preventDefault();
    const value = entry.replace(/\s/g, "");
    if (!/^\d{6}$/.test(value)) return;
    updateSettings({ mcpCode: value });
    setEntry("");
  };
  const asking = on && (!code || status === "wrongCode");

  return (
    <>
      {on && (
        <div className="mcp-panel" role="status">
          <span className="mcp-label">{t("mcp.button")}</span>
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
            <button type="button" className="mcp-link" onClick={() => updateSettings({ mcpCode: "" })}>
              {t("mcp.forget")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
