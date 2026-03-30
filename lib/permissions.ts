/**
 * Chiavi permessi e etichette per la profilazione utenti.
 * I permessi sono salvati come array di stringhe nel Profile (JSON).
 */

export const PERMISSION_KEYS = [
  "admin",
  "users:read",
  "users:write",
  "profiles:read",
  "profiles:write",
  "products:read",
  "products:write",
  "catalogues:read",
  "catalogues:write",
  "export:run",
  "settings:read",
  "settings:write",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  admin: "Amministratore (accesso completo)",
  "users:read": "Utenti – visualizzazione",
  "users:write": "Utenti – modifica e creazione",
  "profiles:read": "Profili – visualizzazione",
  "profiles:write": "Profili – modifica e creazione",
  "products:read": "Prodotti – visualizzazione",
  "products:write": "Prodotti – modifica",
  "catalogues:read": "Cataloghi – visualizzazione",
  "catalogues:write": "Cataloghi – modifica",
  "export:run": "Export – esecuzione",
  "settings:read": "Impostazioni – visualizzazione",
  "settings:write": "Impostazioni – modifica",
};

/** Permessi salvati in DB sono un array di stringhe (subset di PERMISSION_KEYS). */
export type PermissionsList = string[];

/** Verifica se la lista permessi include il permesso richiesto (o admin). */
export function hasPermission(permissions: PermissionsList | null | undefined, key: PermissionKey): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  if (permissions.includes("admin")) return true;
  return permissions.includes(key);
}

/** Restituisce solo permessi validi (presenti in PERMISSION_KEYS). */
export function sanitizePermissions(list: string[]): string[] {
  const set = new Set(PERMISSION_KEYS);
  return list.filter((p) => set.has(p as PermissionKey));
}
