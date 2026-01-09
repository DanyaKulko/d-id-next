import type { ReactNode } from "react";
import TrainingHeader from "./training-header";
import "./page.css";

type TrainingLayoutProps = {
  children: ReactNode;
};

export default function TrainingLayout({ children }: TrainingLayoutProps) {
  return (
    <div className="container">
      <TrainingHeader />
      {children}
    </div>
  );
}
