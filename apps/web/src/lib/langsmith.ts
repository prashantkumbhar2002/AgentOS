/**
 * Helpers for the optional "View in LangSmith" cross-link feature.
 *
 * Reads the dashboard's LangSmith UI base from `VITE_LANGSMITH_UI_BASE` (and an
 * optional org id from `VITE_LANGSMITH_ORG_ID`). When the base var is unset or
 * not a valid http(s) URL, the cross-link feature is treated as disabled and
 * the dashboard simply hides the link — never rendering an unsafe href.
 *
 * The API server NEVER reads these vars; they exist solely so the dashboard
 * can construct deep-links to a separate observability product. The runIds
 * themselves are validated server-side (see `LangSmithRunIdSchema` in
 * `@agentos/types`) before they are persisted, so by the time we reach this
 * file the values are already known-safe.
 */

const RAW_UI_BASE = import.meta.env.VITE_LANGSMITH_UI_BASE?.trim() ?? "";
const RAW_ORG_ID = import.meta.env.VITE_LANGSMITH_ORG_ID?.trim() ?? "";

/**
 * The configured LangSmith UI base URL, or `null` if cross-linking is disabled
 * (env unset, empty, or not http(s)). Resolved once at module load — the env
 * var is build-time only, so re-evaluating per render would be wasted work.
 */
export const LANGSMITH_UI_BASE: string | null = (() => {
    if (!RAW_UI_BASE) return null;
    try {
        const url = new URL(RAW_UI_BASE);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        // Strip any trailing slashes once so callers don't need to.
        return RAW_UI_BASE.replace(/\/+$/, "");
    } catch {
        return null;
    }
})();

/** Optional org id used to prefix `/o/<org>` in the run URL. */
export const LANGSMITH_ORG_ID: string | null = RAW_ORG_ID || null;

/** True when the dashboard should render LangSmith cross-link UI. */
export const isLangSmithEnabled = (): boolean => LANGSMITH_UI_BASE !== null;

export interface BuildLangSmithRunUrlInput {
    base: string;
    orgId?: string | null;
    project?: string | null;
    runId: string;
}

/**
 * Build a deep-link URL to a single LangSmith run.
 *
 * The shape is `${base}[/o/<org>][/projects/p/<project>]/r/<runId>`.
 * Org and project segments are dropped when their values are missing — this
 * gracefully handles self-hosted LangSmith deployments that don't use the
 * org-scoped routing pattern, and rows where `langsmithProject` was never
 * populated (e.g. LLM calls that ran before the agent's project was set).
 *
 * All path segments are URL-encoded to prevent path-injection if an operator
 * accidentally configures values containing `?`, `#`, etc.
 *
 * Returns `null` when:
 *   - `runId` is empty (nothing to link to), or
 *   - `base` is not a valid http(s) URL after trimming.
 *
 * Returning `null` (instead of throwing) keeps the call site simple: render
 * the link when the result is a string, hide it when null.
 */
export function buildLangSmithRunUrl(
    input: BuildLangSmithRunUrlInput,
): string | null {
    const runId = input.runId?.trim();
    if (!runId) return null;

    const base = input.base?.replace(/\/+$/, "") ?? "";
    if (!base) return null;
    try {
        const url = new URL(base);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    } catch {
        return null;
    }

    const orgSegment = input.orgId
        ? `/o/${encodeURIComponent(input.orgId)}`
        : "";
    const projectSegment = input.project
        ? `/projects/p/${encodeURIComponent(input.project)}`
        : "";

    return `${base}${orgSegment}${projectSegment}/r/${encodeURIComponent(runId)}`;
}
