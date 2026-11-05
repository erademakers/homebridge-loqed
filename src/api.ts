import axios from "axios";
import { Logger } from "homebridge";

const sensitiveField = /token|secret|password|authorization|signed|^key$|private.?key|public.?key/i;

/** Log requests and responses while masking credentials and signed commands. */
export async function getLoqed(url: string, log: Logger) {
  const parsed = new URL(url);
  const endpoint = `${parsed.origin}${parsed.pathname}?lock_id=${encodeURIComponent(parsed.searchParams.get("lock_id") ?? "")}`;
  const secrets: string[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (sensitiveField.test(key) && value) {
      secrets.push(value, encodeURIComponent(value));
    }
  });
  const responseBody = (data: unknown): string => {
    let result = JSON.stringify(data, (key, value) => sensitiveField.test(key) ? "[REDACTED]" : value) ?? "[empty]";
    for (const secret of secrets) {
      // Also mask credentials echoed in a plain-text response or an error message.
      const escaped = JSON.stringify(secret).slice(1, -1);
      result = result.split(escaped).join("[REDACTED]");
    }
    return result;
  };
  const started = Date.now();
  log.info(`[LOQED API] GET ${endpoint}`);
  try {
    const response = await axios.get(url);
    log.info(
      `[LOQED API] GET ${endpoint} -> HTTP ${response.status} (${Date.now() - started} ms); response: ${responseBody(response.data)}`,
    );
    return response;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const result = status === undefined ? "failed (no HTTP response)" : `failed (HTTP ${status})`;
    const body = axios.isAxiosError(error) && error.response ? `; response: ${responseBody(error.response.data)}` : "";
    log.warn(`[LOQED API] GET ${endpoint} -> ${result} (${Date.now() - started} ms)${body}`);
    throw error;
  }
}
