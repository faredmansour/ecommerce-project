export function getAuthReturnPath(from, fallback = "/") {
  const pathname = from?.pathname;
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return fallback;
  }

  const search = typeof from.search === "string" && from.search.startsWith("?") ? from.search : "";
  const hash = typeof from.hash === "string" && from.hash.startsWith("#") ? from.hash : "";
  return `${pathname}${search}${hash}`;
}
