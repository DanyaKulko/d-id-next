import type { ReactNode } from "react";
import SettingsHeader from "./settings-header";
import "./page.css";

type SettingsLayoutProps = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="container">
      <SettingsHeader />
      {children}
    </div>
  );
}
