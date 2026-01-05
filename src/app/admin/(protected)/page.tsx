import RolesClient from "./roles.client";
import "./page.css";
// import "./tooltips.css";

export default function RolesPage() {
    return (
        <div className="container">
            <div className="breadcrumbs">
                <div className="breadcrumb-item">Roles</div>
                <span className="breadcrumb-separator">›</span>
                <div className="breadcrumb-item" id="current-role">
                    Basic Neil
                </div>
            </div>

            <h1 className="page-title">Role Personalization</h1>

            <RolesClient />
        </div>
    );
}
