import TrainingClient from "./training.client";
import "./page.css";

export default function TrainingPage() {
    return (
        <div className="container">
            <div className="breadcrumbs">
                <div className="breadcrumb-item">Training</div>
                <span className="breadcrumb-separator">›</span>
                <div className="breadcrumb-item" id="current-section">
                    Knowledge Archive
                </div>
            </div>

            <h1 className="page-title">Knowledge Archive</h1>

            <TrainingClient />
        </div>
    );
}
