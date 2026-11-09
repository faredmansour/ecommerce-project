import { Check } from "lucide-react";

const steps = [
  "Customer information",
  "Shipping information",
  "Payment",
  "Order review",
  "Confirmation",
];

export default function CheckoutProgress({ currentStep }) {
  return (
    <nav aria-label="Checkout progress" className="checkout-progress rounded-lg border border-line bg-surface p-4 sm:p-5">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((label, index) => {
          const step = index + 1;
          const complete = step < currentStep;
          const active = step === currentStep;
          return (
            <li key={label} aria-current={active ? "step" : undefined} className="flex min-w-0 items-center gap-2.5">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${complete || active ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface-muted text-muted"}`}>
                {complete ? <Check size={16} aria-hidden="true" /> : step}
              </span>
              <span className={`text-xs leading-4 sm:text-sm ${active ? "font-semibold text-brand" : complete ? "font-medium text-ink" : "text-muted"}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
