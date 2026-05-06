import {
  CUSTOMER_LOGIN_PATH,
  STAFF_LOGIN_PATH,
  getCustomerAuthRouteState,
  getSafeRedirectPath,
  getStaffAuthRouteState,
} from "./routeGuards.js";

describe("auth route guards", () => {
  it("redirects unauthenticated staff deep links to staff login", () => {
    const location = { pathname: "/settings", search: "?tab=account", hash: "#profile" };

    expect(
      getStaffAuthRouteState({
        isOnline: true,
        loading: false,
        user: null,
        staffProfile: null,
        location,
      }),
    ).toEqual({
      status: "redirect",
      to: STAFF_LOGIN_PATH,
      state: { from: location },
    });
  });

  it("denies signed-in users without a staff profile", () => {
    expect(
      getStaffAuthRouteState({
        isOnline: true,
        loading: false,
        user: { id: "user-1" },
        staffProfile: null,
        location: { pathname: "/humans", search: "", hash: "" },
      }),
    ).toEqual({ status: "denied" });
  });

  it("sends authenticated staff away from login to their original route", () => {
    expect(
      getStaffAuthRouteState({
        isOnline: true,
        loading: false,
        user: { id: "user-1" },
        staffProfile: { id: "profile-1" },
        location: { pathname: STAFF_LOGIN_PATH, search: "", hash: "" },
        from: { pathname: "/reports", search: "?range=month", hash: "" },
      }),
    ).toEqual({ status: "redirect", to: "/reports?range=month" });
  });

  it("allows the staff app in offline mode", () => {
    expect(
      getStaffAuthRouteState({
        isOnline: false,
        loading: false,
        user: null,
        staffProfile: null,
        location: { pathname: "/settings", search: "", hash: "" },
      }),
    ).toEqual({ status: "allow" });
  });

  it("redirects unauthenticated customer deep links to customer login", () => {
    const location = { pathname: "/customer/book", search: "?dog=ada", hash: "" };

    expect(
      getCustomerAuthRouteState({
        loading: false,
        user: null,
        location,
      }),
    ).toEqual({
      status: "redirect",
      to: CUSTOMER_LOGIN_PATH,
      state: { from: location },
    });
  });

  it("sends authenticated customers away from login to their original route", () => {
    expect(
      getCustomerAuthRouteState({
        loading: false,
        user: { id: "customer-1" },
        location: { pathname: CUSTOMER_LOGIN_PATH, search: "", hash: "" },
        from: { pathname: "/customer/book", search: "?dog=ada", hash: "#slot" },
      }),
    ).toEqual({ status: "redirect", to: "/customer/book?dog=ada#slot" });
  });

  it("does not redirect back to login pages or outside app paths", () => {
    expect(getSafeRedirectPath({ pathname: STAFF_LOGIN_PATH }, "/")).toBe("/");
    expect(getSafeRedirectPath({ pathname: CUSTOMER_LOGIN_PATH }, "/customer")).toBe("/customer");
    expect(getSafeRedirectPath({ pathname: "https://example.com" }, "/")).toBe("/");
  });
});
