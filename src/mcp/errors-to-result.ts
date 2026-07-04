import { UnifiApiError, UnifiAuthError, UnifiError, UnifiTransportError } from "../http/errors.js";
import type { Logger } from "../logging.js";

export type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>;
  isError?: boolean;
};

const message = (toolName: string, err: unknown): string => {
  if (err instanceof UnifiAuthError) return `Authentication failed in ${toolName}: ${err.message}`;
  if (err instanceof UnifiApiError) {
    const s = err.status === undefined ? "" : ` [HTTP ${err.status}]`;
    return `${err.operationId} returned an error: ${err.message}${s}`;
  }
  if (err instanceof UnifiTransportError) return `Transport error in ${toolName}: ${err.message}`;
  if (err instanceof UnifiError) return `${toolName}: ${err.message}`;
  if (err instanceof Error) return `${toolName}: ${err.message}`;
  return `Internal error in ${toolName} — see server logs.`;
};

export const wrapHandler = <A>(
  toolName: string,
  handler: (a: A) => Promise<ToolResult>,
  log: Logger,
): ((a: A) => Promise<ToolResult>) => {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      log.error({ tool: toolName, err }, "tool handler threw");
      return { content: [{ type: "text", text: message(toolName, err) }], isError: true };
    }
  };
};
