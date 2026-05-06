import { useCallback, useState } from "react";

type UseShowOncePerSessionResult = {
  show: boolean;
  trigger: () => void;
  close: () => void;
};

export function useShowOncePerSession(
  key: string,
): UseShowOncePerSessionResult {
  const [show, setShow] = useState(false);

  const trigger = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    setShow(true);
  }, [key]);

  const close = useCallback(() => setShow(false), []);

  return { show, trigger, close };
}
