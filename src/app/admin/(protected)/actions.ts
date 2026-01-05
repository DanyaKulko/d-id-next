"use server";

import {revalidatePath} from "next/cache";

function toObject(formData: FormData) {
    return Object.fromEntries(formData.entries());
}

export async function saveMainSettingsAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveMainSettings", payload);
    revalidatePath("/admin");
    return { ok: true };
}

export async function saveRoleSettingsAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveRoleSettings", payload);
    revalidatePath("/admin");
    return { ok: true };
}

export async function saveIntegrationConfigAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveIntegrationConfig", payload);
    revalidatePath("/admin/settings");
    return { ok: true };
}

export async function saveExternalSourcesConfigAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveExternalSources", payload);
    revalidatePath("/admin/settings");
    return { ok: true };
}

export async function saveSafetyInstructionsAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveSafetyInstructions", payload);
    revalidatePath("/admin/training");
    return { ok: true };
}

export async function saveManualTrainingAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveManualTraining", payload);
    revalidatePath("/admin/training");
    return { ok: true };
}

export async function saveUserUpdateAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveUserUpdate", payload);
    revalidatePath("/admin/settings");
    return { ok: true };
}

export async function saveSessionRetentionAction(formData: FormData) {
    const payload = toObject(formData);
    console.log("[admin] saveSessionRetention", payload);
    revalidatePath("/admin/settings");
    return { ok: true };
}
