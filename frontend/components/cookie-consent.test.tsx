import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsent } from "@/components/cookie-consent";

/**
 * The consent banner is a legal surface — these tests pin the behaviour the
 * privacy policy promises: shown by default, dismissable, and the choice
 * persists so returning users aren't re-nagged.
 */
describe("CookieConsent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders on first visit (no stored choice)", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/essential cookies/i)).toBeInTheDocument();
  });

  it("hides and persists after accepting", () => {
    const { container } = render(<CookieConsent />);
    fireEvent.click(screen.getByText(/got it/i));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(window.localStorage.getItem("mr_cookie_consent_v1")).toBe("accepted");
  });

  it("does not render when a prior choice exists", () => {
    window.localStorage.setItem("mr_cookie_consent_v1", "declined");
    const { container } = render(<CookieConsent />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
