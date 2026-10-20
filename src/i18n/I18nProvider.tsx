import React, { useEffect, useState } from "react";
import type { FatNotesPluginSDK } from "fat-notes-sdk";
import { IntlProvider } from "react-intl";
import { catalog, normalizeLocale, type LocaleId } from "./index";

interface Props {
  sdk: FatNotesPluginSDK;
  children: React.ReactNode;
}

export function useHostLocale(sdk: FatNotesPluginSDK): LocaleId {
  const [locale, setLocale] = useState<LocaleId>(() => normalizeLocale(sdk.ui.i18n.locale));

  useEffect(() => {
    setLocale(normalizeLocale(sdk.ui.i18n.locale));
    const sub = sdk.ui.i18n.onChange((next) => setLocale(normalizeLocale(next)));
    return () => sub.dispose();
  }, [sdk]);

  return locale;
}

const I18nProvider: React.FC<Props> = ({ sdk, children }) => {
  const locale = useHostLocale(sdk);
  return (
    <IntlProvider
      locale={locale === "en_US" ? "en" : "zh"}
      messages={catalog(locale)}
      defaultLocale="zh"
      onError={(error) => {
        if (error.code === "MISSING_TRANSLATION") return;
        // eslint-disable-next-line no-console
        console.error(error);
      }}
    >
      {children}
    </IntlProvider>
  );
};

export default I18nProvider;
