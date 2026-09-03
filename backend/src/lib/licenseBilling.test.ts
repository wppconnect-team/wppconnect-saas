import { describe, expect, test } from "bun:test";
import { resolveSandboxBillingEvent } from "./licenseBilling";

describe("sandbox license billing lifecycle", () => {
  test("starts a monthly purchase period and clamps end-of-month dates", () => {
    const result = resolveSandboxBillingEvent({
      eventType: "purchase.completed",
      currentExpiresAt: null,
      occurredAt: new Date("2027-01-31T12:00:00.000Z"),
      billingInterval: "month",
    });
    expect(result.status).toBe("active");
    expect(result.expiresAt?.toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });

  test("renews from the current period end instead of shortening access", () => {
    const result = resolveSandboxBillingEvent({
      eventType: "renewal.succeeded",
      currentExpiresAt: new Date("2027-06-15T09:30:00.000Z"),
      occurredAt: new Date("2027-06-01T09:30:00.000Z"),
      billingInterval: "year",
    });
    expect(result.status).toBe("active");
    expect(result.expiresAt?.toISOString()).toBe("2028-06-15T09:30:00.000Z");
  });

  test.each([
    ["payment.failed", "past_due"],
    ["subscription.cancelled", "cancelled"],
    ["refund.completed", "refunded"],
    ["dispute.opened", "disputed"],
  ] as const)(
    "maps %s to %s without changing the period",
    (eventType, expectedStatus) => {
      const expiresAt = new Date("2027-07-01T00:00:00.000Z");
      const result = resolveSandboxBillingEvent({
        eventType,
        currentExpiresAt: expiresAt,
        occurredAt: new Date("2027-06-02T00:00:00.000Z"),
        billingInterval: "month",
      });
      expect(result.status).toBe(expectedStatus);
      expect(result.expiresAt).toEqual(expiresAt);
    },
  );
});
