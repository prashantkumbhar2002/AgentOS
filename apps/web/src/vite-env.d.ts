/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /**
   * Base URL of the LangSmith UI for the optional "View in LangSmith" cross-link.
   * When unset (or not http(s)), the dashboard hides the cross-link entirely —
   * nothing is sent to LangSmith from the API server regardless. Examples:
   *   - `https://smith.langchain.com` (cloud)
   *   - `http://localhost:1984` (local self-hosted)
   */
  readonly VITE_LANGSMITH_UI_BASE?: string;
  /**
   * Optional LangSmith org id. When set, deep-links use the `/o/<org>` path
   * segment so they land on org-scoped pages. Self-hosted deployments that
   * don't use the org-scoped routing can leave this unset.
   */
  readonly VITE_LANGSMITH_ORG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
