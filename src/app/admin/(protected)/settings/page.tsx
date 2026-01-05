import SettingsClient from "./settings.client";
import "./page.css";

export default function SettingsPage() {
    return (
        <div className="container">
            <div className="breadcrumbs">
                <div className="breadcrumb-item">Settings</div>
                <span className="breadcrumb-separator">›</span>
                <div className="breadcrumb-item" id="current-section">
                    Integrations
                </div>
            </div>

            <h1 className="page-title">Integrations</h1>

            <SettingsClient />
        </div>
    );
}
