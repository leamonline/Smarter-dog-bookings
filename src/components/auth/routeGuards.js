export const STAFF_LOGIN_PATH = "/login";
export const CUSTOMER_LOGIN_PATH = "/login";

const BLOCKED_REDIRECT_PATHS = new Set([
  STAFF_LOGIN_PATH,
  CUSTOMER_LOGIN_PATH,
]);

function isSafeAppPath(pathname) {
  return (
    typeof pathname === "string" &&
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !BLOCKED_REDIRECT_PATHS.has(pathname)
  );
}

export function getSafeRedirectPath(from, fallback) {
  if (!isSafeAppPath(from?.pathname)) {
    return fallback;
  }

  const search =
    typeof from.search === "string" && from.search.startsWith("?")
      ? from.search
      : "";
  const hash =
    typeof from.hash === "string" && from.hash.startsWith("#")
      ? from.hash
      : "";

  return `${from.pathname}${search}${hash}`;
}

export function getStaffAuthRouteState({
  isOnline,
  loading,
  user,
  staffProfile,
  location,
  from,
}) {
  if (loading) {
    return { status: "loading" };
  }

  if (!isOnline) {
    return { status: "allow" };
  }

  const isLoginRoute = location?.pathname === STAFF_LOGIN_PATH;

  if (!user) {
    if (isLoginRoute) {
      return { status: "login" };
    }

    return {
      status: "redirect",
      to: STAFF_LOGIN_PATH,
      state: { from: location },
    };
  }

  if (!staffProfile) {
    return { status: "denied" };
  }

  if (isLoginRoute) {
    return {
      status: "redirect",
      to: getSafeRedirectPath(from, "/"),
    };
  }

  return { status: "allow" };
}

export function getCustomerAuthRouteState({
  loading,
  user,
  location,
  from,
}) {
  if (loading) {
    return { status: "loading" };
  }

  const isLoginRoute = location?.pathname === CUSTOMER_LOGIN_PATH;

  if (!user) {
    if (isLoginRoute) {
      return { status: "login" };
    }

    return {
      status: "redirect",
      to: CUSTOMER_LOGIN_PATH,
      state: { from: location },
    };
  }

  if (isLoginRoute) {
    return {
      status: "redirect",
      to: getSafeRedirectPath(from, "/"),
    };
  }

  return { status: "allow" };
}
