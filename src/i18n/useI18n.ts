import { useMemo } from "react";
import { useIntl } from "react-intl";
import { localize, type TextFn } from "./index";

const useI18n = () => {
  const intl = useIntl();
  const text = useMemo<TextFn>(() => {
    return (id, values) => {
      if (!id) return "";
      return intl.formatMessage({ id, defaultMessage: id }, values);
    };
  }, [intl]);

  const message = useMemo(() => {
    return (raw?: string) => localize(raw || "", text);
  }, [text]);

  return { text, message, locale: intl.locale };
};

export default useI18n;
