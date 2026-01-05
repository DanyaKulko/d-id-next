export function hasRole(userRoles: string[], role: "ADMIN" | "USER") {
    return userRoles.includes(role);
}

export function requireRole(userRoles: string[], role: "ADMIN" | "USER") {
    if (!hasRole(userRoles, role)) throw new Error("FORBIDDEN");
}
