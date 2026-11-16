import type { Translate } from "@tripreplay/i18n";
import { useState } from "react";
import { APP_VERSION, checkForUpdate, type UpdateResult } from "./update-check.ts";

/** The version and **Check for updates**, in the About section of Settings (docs/ui-design.md §2.2). */
export function UpdateCheck({ t }: { readonly t: Translate }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateResult | undefined>();
  const check = () => {
    setChecking(true);
    setResult(undefined);
    void checkForUpdate().then((found) => {
      setResult(found);
      setChecking(false);
    });
  };
  return (
    <div className="update-check">
      <p>{t("about.version", { version: APP_VERSION })}</p>
      <div className="update-check-row">
        <button type="button" className="header-button" disabled={checking} onClick={check}>
          {t("update.check")}
        </button>
        <span role="status">
          {checking && t("update.checking")}
          {result?.kind === "upToDate" && t("update.upToDate")}
          {result?.kind === "ready" && t("update.ready")}
          {result?.kind === "available" && t("update.available", { version: result.version })}
          {result?.kind === "noReleases" && t("update.noReleases")}
          {result?.kind === "failed" && t("update.failed")}
        </span>
      </div>
      {result?.kind === "ready" && (
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>
          {t("update.reload")}
        </button>
      )}
      {result?.kind === "available" && (
        <p>
          <a className="primary-button" href={result.url} target="_blank" rel="noopener">
            {t("update.download")}
          </a>{" "}
          {t("update.installHint")}
        </p>
      )}
    </div>
  );
}
