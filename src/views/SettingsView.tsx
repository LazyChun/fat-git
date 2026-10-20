import React, { useEffect, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { Alert, Button, Input, InputNumber, Switch } from "antd";
import { autoCommitNow, getAutoStatus, getSettings, saveSettings, usePoll } from "../api";
import type { Settings } from "../types";
import { linesOf, skipLabel, formatTime } from "../format";
import useI18n from "../i18n/useI18n";
import LoadingState from "../components/LoadingState";
import styles from "../app.less";

interface Props {
  sdk: FatNotesPluginSDK;
}

const SettingsView: React.FC<Props> = ({ sdk }) => {
  const { text, message } = useI18n();
  const statusState = usePoll(() => getAutoStatus(sdk), 5000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prefixes, setPrefixes] = useState("");
  const [exclude, setExclude] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    getSettings(sdk)
      .then((next) => {
        if (!alive) return;
        setSettings(next);
        setPrefixes(next.autoCommit.includePrefixes.join("\n"));
        setExclude(next.autoCommit.exclude.join("\n"));
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [sdk]);

  const update = (patch: Partial<Settings["autoCommit"]>) => {
    setSettings((current) =>
      current
        ? { ...current, autoCommit: { ...current.autoCommit, ...patch } }
        : current,
    );
  };

  const persist = async () => {
    if (!settings) return;
    setBusy("save");
    setError("");
    try {
      const next: Settings = {
        graphLimit: settings.graphLimit,
        autoCommit: {
          ...settings.autoCommit,
          includePrefixes: linesOf(prefixes),
          exclude: linesOf(exclude),
        },
      };
      const saved = await saveSettings(sdk, next);
      setSettings(saved);
      sdk.ui.toast.success(text("git.settings.saved"));
      statusState.reload();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setError(text);
    } finally {
      setBusy("");
    }
  };

  const runNow = async () => {
    setBusy("now");
    setError("");
    try {
      const result = await autoCommitNow(sdk);
      if (result.error) sdk.ui.toast.error(message(result.error));
      else if (result.committed) sdk.ui.toast.success(result.subject || text("git.skip.autoDone"));
      else sdk.ui.toast.info(skipLabel(result.skipped, text) || text("git.skip.none"));
      statusState.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  const last = statusState.data?.last;
  const lastText = !last?.at
    ? text("git.settings.never")
    : last.error
      ? text("git.settings.lastFailed", { time: formatTime(last.at), error: message(last.error) })
      : last.committed
        ? text("git.settings.lastCommitted", {
            time: formatTime(last.at),
            count: last.files || 0,
            subject: last.subject || "",
          })
        : text("git.settings.lastSkipped", {
            time: formatTime(last.at),
            reason: skipLabel(last.skipped, text),
          });

  if (!settings) {
    return (
      <div className={styles.page}>
        {error ? (
          <Alert type="error" showIcon title={text("git.settings.readFailed")} description={message(error)} />
        ) : (
          <LoadingState text={text("git.settings.loading")} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <p className={styles.hint}>{text("git.settings.intro")}</p>
      {error ? <Alert type="error" showIcon style={{ marginBottom: 12 }} title={text("git.common.actionFailed")} description={message(error)} /> : null}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.enabled")}</span>
        <Switch checked={settings.autoCommit.enabled} onChange={(checked) => update({ enabled: checked })} />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.interval")}</span>
        <InputNumber
          min={1}
          max={1440}
          value={settings.autoCommit.intervalMinutes}
          onChange={(value) => update({ intervalMinutes: typeof value === "number" ? value : 15 })}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.message")}</span>
        <Input
          value={settings.autoCommit.messageTemplate}
          onChange={(event) => update({ messageTemplate: event.target.value })}
        />
        <span className={styles.hint}>{text("git.settings.placeholders")}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.untracked")}</span>
        <Switch
          checked={settings.autoCommit.includeUntracked}
          onChange={(checked) => update({ includeUntracked: checked })}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.prefixes")}</span>
        <Input.TextArea
          rows={4}
          value={prefixes}
          placeholder={"books\nconfs\nflows\nskills"}
          onChange={(event) => setPrefixes(event.target.value)}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.exclude")}</span>
        <Input.TextArea rows={8} value={exclude} onChange={(event) => setExclude(event.target.value)} />
        <span className={styles.hint}>{text("git.settings.excludeHint")}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{text("git.settings.graphLimit")}</span>
        <InputNumber
          min={50}
          max={2000}
          value={settings.graphLimit}
          onChange={(value) =>
            setSettings((current) =>
              current ? { ...current, graphLimit: typeof value === "number" ? value : 300 } : current,
            )
          }
        />
      </div>
      <div className={styles.toolbar}>
        <Button type="primary" loading={busy === "save"} onClick={persist}>
          {text("git.settings.save")}
        </Button>
        <Button loading={busy === "now"} onClick={runNow}>
          {text("git.settings.runNow")}
        </Button>
      </div>
      <p className={styles.hint}>
        {text("git.settings.status", {
          state: statusState.data?.running ? text("git.settings.running") : text("git.settings.stopped"),
          last: lastText,
        })}
      </p>
    </div>
  );
};

export default SettingsView;
