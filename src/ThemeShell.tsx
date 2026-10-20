/*
 * 跟随宿主 light/dark，给插件里的 antd 组件套上对应算法。
 */
import React, { useEffect, useMemo, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { ConfigProvider, theme as antdTheme } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import I18nProvider, { useHostLocale } from "./i18n/I18nProvider";

interface Props {
  sdk: FatNotesPluginSDK;
  padding?: number;
  fill?: boolean;
  children: React.ReactNode;
}

const Themed: React.FC<Props> = ({ sdk, padding = 12, fill = false, children }) => {
  const locale = useHostLocale(sdk);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return sdk.ui.theme.get();
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    let disposed = false;
    const sub = sdk.ui.theme.onChange((next) => {
      if (!disposed) setTheme(next);
    });
    return () => {
      disposed = true;
      sub.dispose();
    };
  }, [sdk]);

  const isDark = theme === "dark";
  const themeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: { fontSize: 13 },
    }),
    [isDark],
  );

  return (
    <ConfigProvider locale={locale === "en_US" ? enUS : zhCN} theme={themeConfig}>
      <div
        style={{
          height: "100%",
          minHeight: 0,
          padding,
          boxSizing: "border-box",
          overflow: fill ? "hidden" : "auto",
          display: fill ? "flex" : "block",
          flexDirection: "column",
          color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.88)",
        }}
      >
        {children}
      </div>
    </ConfigProvider>
  );
};

const ThemeShell: React.FC<Props> = ({ sdk, children, ...rest }) => (
  <I18nProvider sdk={sdk}>
    <Themed sdk={sdk} {...rest}>
      {children}
    </Themed>
  </I18nProvider>
);

export default ThemeShell;
