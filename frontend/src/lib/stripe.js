import { loadStripe } from "@stripe/stripe-js";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Stripe is optional: card payments are only offered when a publishable key is
// configured. Without it the checkout falls back to Cash on Delivery.
export const stripeEnabled = Boolean(publishableKey);
export const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
