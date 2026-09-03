export const sandboxBillingEventTypes = [
  "purchase.completed",
  "renewal.succeeded",
  "payment.failed",
  "subscription.cancelled",
  "refund.completed",
  "dispute.opened",
] as const;

export type SandboxBillingEventType = (typeof sandboxBillingEventTypes)[number];
export type LicenseBillingStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "revoked";

type BillingTransitionInput = {
  eventType: SandboxBillingEventType;
  currentExpiresAt: Date | null;
  occurredAt: Date;
  billingInterval: "month" | "year";
};

export type BillingTransition = {
  status: LicenseBillingStatus;
  expiresAt: Date | null;
};

function addMonthsClamped(value: Date, months: number): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + months;
  const day = value.getUTCDate();
  const result = new Date(
    Date.UTC(
      year,
      month,
      1,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function resolveSandboxBillingEvent(
  input: BillingTransitionInput,
): BillingTransition {
  if (!Number.isFinite(input.occurredAt.getTime()))
    throw new Error("Invalid billing event timestamp");

  if (
    input.eventType === "purchase.completed" ||
    input.eventType === "renewal.succeeded"
  ) {
    const current = input.currentExpiresAt?.getTime() ?? 0;
    const periodStart =
      current > input.occurredAt.getTime()
        ? input.currentExpiresAt!
        : input.occurredAt;
    return {
      status: "active",
      expiresAt: addMonthsClamped(
        periodStart,
        input.billingInterval === "year" ? 12 : 1,
      ),
    };
  }

  const statusByEvent: Record<
    Exclude<
      SandboxBillingEventType,
      "purchase.completed" | "renewal.succeeded"
    >,
    LicenseBillingStatus
  > = {
    "payment.failed": "past_due",
    "subscription.cancelled": "cancelled",
    "refund.completed": "refunded",
    "dispute.opened": "disputed",
  };

  return {
    status: statusByEvent[input.eventType],
    expiresAt: input.currentExpiresAt,
  };
}
