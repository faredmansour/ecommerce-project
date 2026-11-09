function safelyRemove(storage, key) {
  try { storage?.removeItem(key); } catch { /* Storage can be disabled or unavailable. */ }
}

export async function restoreSession({ getMe, storage = globalThis.localStorage }) {
  let token = null;
  try {
    token = storage?.getItem("token") || null;
    const cachedUser = storage?.getItem("user");
    if (cachedUser) {
      try { JSON.parse(cachedUser); } catch { /* Discard malformed cache below. */ }
      safelyRemove(storage, "user");
    }
  } catch {
    return null;
  }

  if (!token) {
    safelyRemove(storage, "user");
    return null;
  }

  try {
    const response = await getMe();
    const user = response?.data?.data || response?.data;
    if (!user || typeof user !== "object" || !(user.id || user._id)) {
      safelyRemove(storage, "token");
      safelyRemove(storage, "user");
      return null;
    }
    try { storage.setItem("user", JSON.stringify(user)); } catch { /* Use server data in memory if storage is unavailable. */ }
    return { token, user };
  } catch (error) {
    safelyRemove(storage, "user");
    if (error?.response?.status === 401 || error?.response?.status === 403) safelyRemove(storage, "token");
    return null;
  }
}

export function expireLocalSession() {
  safelyRemove(globalThis.localStorage, "token");
  safelyRemove(globalThis.localStorage, "user");
  try { globalThis.window?.dispatchEvent(new Event("alfredo:unauthorized")); } catch { /* Not running in a browser context. */ }
}
