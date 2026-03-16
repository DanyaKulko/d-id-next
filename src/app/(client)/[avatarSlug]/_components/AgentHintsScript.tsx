"use client";

import { useEffect } from "react";

type AgentHintsScriptProps = {
  src: string;
};

const clearLegacyHintsArtifacts = (src: string) => {
  for (const element of document.querySelectorAll('[id^="na-hints-"]')) {
    element.remove();
  }

  for (const element of document.querySelectorAll("style")) {
    if (element.textContent?.includes("#na-hints-root")) {
      element.remove();
    }
  }

  for (const element of document.querySelectorAll("script")) {
    const elementSrc = element.getAttribute("src") ?? "";
    if (elementSrc === src || element.dataset.agentHintsScript === "true") {
      element.remove();
    }
  }
};

export function AgentHintsScript({ src }: AgentHintsScriptProps) {
  useEffect(() => {
    if (!src) return;

    clearLegacyHintsArtifacts(src);

    const addedNodes = new Set<Element>();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element && node instanceof HTMLScriptElement === false) {
            addedNodes.add(node);
          }
        }
      }
    });

    observer.observe(document.head, { childList: true });
    observer.observe(document.body, { childList: true });

    const script = document.createElement("script");
    const scriptUrl = new URL(src, window.location.href);
    scriptUrl.searchParams.set("ver", Date.now().toString());
    script.src = scriptUrl.toString();
    script.async = true;
    script.dataset.agentHintsScript = "true";

    const stopObserving = () => {
      window.setTimeout(() => observer.disconnect(), 0);
    };

    script.addEventListener("load", stopObserving, { once: true });
    script.addEventListener("error", stopObserving, { once: true });
    document.body.appendChild(script);

    return () => {
      observer.disconnect();
      script.remove();
      Array.from(addedNodes)
        .reverse()
        .forEach((node) => {
          if (node.isConnected) {
            node.remove();
          }
        });
      clearLegacyHintsArtifacts(src);
    };
  }, [src]);

  return null;
}
