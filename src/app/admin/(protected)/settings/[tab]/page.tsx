import {redirect} from "next/navigation";
import {
    type ErrorLogFilters,
    type ErrorLogPage,
    fetchAuthRequirement,
    fetchErrorLogs,
    fetchIntegrationConfig,
    fetchSessionRecords,
    fetchSessionRoles,
    fetchUsers,
    type SessionFilters,
    type SessionPage,
    type SessionRoleOption,
    type UserRow,
} from "@/app/admin/(protected)/admin-data";
import {getCurrentUser} from "@/lib/auth/require";
import SettingsClient from "../settings.client";
import {type SettingsTabId, settingsTabs} from "../settings.tabs";

type SettingsTabPageProps = {
    params: Promise<{ tab: string }>;
    searchParams?: Promise<any>;
};

type IntegrationConfig = Awaited<ReturnType<typeof fetchIntegrationConfig>>;

const parseNumber = (
    value: string | string[] | undefined,
    fallback: number,
) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const parseString = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export default async function SettingsTabPage({
                                                  params,
                                                  searchParams,
                                              }: SettingsTabPageProps) {
    const {tab: rawTab} = await params;
    const {
        role,
        from: rawFrom,
        to: rawTo,
        language: rawLanguage,
        limit: rawLimit,
        page: rawPage,
    } = await searchParams
    const tab = rawTab as SettingsTabId;
    if (!settingsTabs.includes(tab)) {
        redirect("/admin/settings/integrations");
    }

    let users: UserRow[] | undefined;
    let integrationConfig: IntegrationConfig | undefined;
    let authRequired: boolean | undefined;
    let adminEmail: string | undefined;
    let sessionsPage: SessionPage | undefined;
    let sessionRoles: SessionRoleOption[] | undefined;
    let sessionFilters: SessionFilters | undefined;
    let errorLogPage: ErrorLogPage | undefined;
    let errorLogFilters: ErrorLogFilters | undefined;

    if (tab === "integrations") {
        integrationConfig = await fetchIntegrationConfig();
    }

    if (tab === "user-access") {
        [users, authRequired] = await Promise.all([
            fetchUsers(),
            fetchAuthRequirement(),
        ]);
    }

    if (tab === "admin-credentials") {
        const session = await getCurrentUser();
        adminEmail = session?.user.email ?? "";
    }

    if (tab === "sessions") {
        const roleId = parseString(role);
        const from = parseString(rawFrom);
        const to = parseString(rawTo);
        const language = parseString(rawLanguage);
        const limit = parseNumber(rawLimit, 10);
        const page = parseNumber(rawPage, 1);

        sessionFilters = {
            roleId: roleId !== 'all' ? to : undefined,
            from: from || undefined,
            to: to || undefined,
            language: language !== 'all' ? to : undefined,
            page,
            limit,
        };

        [sessionsPage, sessionRoles] = await Promise.all([
            fetchSessionRecords(sessionFilters),
            fetchSessionRoles(),
        ]);
    }

    if (tab === "errors-debug") {
        const limit = parseNumber(rawLimit, 10);
        const page = parseNumber(rawPage, 1);

        errorLogFilters = {page, limit};
        errorLogPage = await fetchErrorLogs(errorLogFilters);
    }

    return (
        <SettingsClient
            key={tab}
            initialTab={tab}
            initialUsers={users}
            initialIntegrationConfig={integrationConfig}
            initialAuthRequired={authRequired}
            initialAdminEmail={adminEmail}
            initialSessions={sessionsPage}
            initialSessionFilters={sessionFilters}
            initialSessionRoles={sessionRoles}
            initialErrorLogs={errorLogPage}
            initialErrorLogFilters={errorLogFilters}
        />
    );
}
