import { type AgentToolContext, agentTools } from "@tripreplay/app";

/** A tool as WebMCP registers it (https://webmachinelearning.github.io/webmcp/); not yet in the DOM types. */
interface ModelContextTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: object;
  readonly execute: (input: Record<string, unknown>, options: { readonly signal: AbortSignal }) => Promise<unknown>;
  readonly annotations?: { readonly readOnlyHint?: boolean; readonly untrustedContentHint?: boolean };
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { readonly signal?: AbortSignal }): Promise<void>;
}

/**
 * The browser's WebMCP entry point, where it offers one: `document.modelContext`, or
 * `navigator.modelContext` in the Chrome versions that had it there first.
 */
export function modelContext(): ModelContext | undefined {
  const found =
    (document as { modelContext?: ModelContext }).modelContext ??
    (navigator as { modelContext?: ModelContext }).modelContext;
  return typeof found?.registerTool === "function" ? found : undefined;
}

/** Whether the user lets AI agents in this browser use the open trip; off unless chosen. */
export const AGENT_TOOLS_KEY = "tripreplay.agentTools";

/**
 * Offers the agent tools of TripReplay (docs/adr/0010-agent-tools.md) to the browser's AI agent
 * while a trip is open and the user has turned them on. The tools are registered once and look up
 * the open trip when called, because a browser may keep a tool after it was withdrawn; called
 * while withdrawn, they refuse.
 */
export function createAgentBridge(context: ModelContext, titles: (name: string) => string, newId: () => string) {
  let current: Omit<AgentToolContext, "newId"> | undefined;
  let registration: AbortController | undefined;
  const open = (): Omit<AgentToolContext, "newId"> => {
    if (!current) throw new Error("No trip is open in TripReplay, or its AI agent tools are turned off.");
    return current;
  };
  const tools = agentTools({
    project: () => open().project(),
    dispatch: (command) => open().dispatch(command),
    newId,
  });

  return {
    /** Offers the tools for `trip`, or withdraws them when undefined. */
    set(trip: Omit<AgentToolContext, "newId"> | undefined): void {
      current = trip;
      if (trip && !registration) {
        registration = new AbortController();
        for (const tool of tools) {
          context
            .registerTool(
              {
                name: tool.name,
                title: titles(tool.name),
                description: tool.description,
                inputSchema: tool.inputSchema,
                // Tool results carry the user's own text, which came with the trip and may have
                // been written by someone else, for example in a restored backup.
                annotations: { readOnlyHint: tool.readOnly, untrustedContentHint: tool.readOnly },
                execute: async (input) => tool.run(input),
              },
              { signal: registration.signal },
            )
            // A tool that the browser kept from before is still registered and works.
            .catch(() => {});
        }
      } else if (!trip && registration) {
        registration.abort();
        registration = undefined;
      }
    },
  };
}

let bridge: ReturnType<typeof createAgentBridge> | undefined;

/** The page's one bridge, or undefined where the browser offers no WebMCP. */
export function agentBridge(titles: (name: string) => string, newId: () => string) {
  const context = modelContext();
  if (!context) return undefined;
  bridge ??= createAgentBridge(context, titles, newId);
  return bridge;
}
