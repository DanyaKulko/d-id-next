import type { ReactNode } from "react";
import { fetchTrainingRoles } from "@/app/admin/(protected)/admin-data";
import TrainingHeader from "./training-header";
import "./page.css";

type TrainingLayoutProps = {
  children: ReactNode;
};

export default async function TrainingLayout({ children }: TrainingLayoutProps) {
  const roles = await fetchTrainingRoles();
  return (
    <div className="container">
      <TrainingHeader roles={roles} />
      {children}
    </div>
  );
}
