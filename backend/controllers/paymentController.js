const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ status: "fail", message: "Amount must be greater than zero" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      automatic_payment_methods: { enabled: true },
    });

    res.status(200).json({ status: "success", data: { clientSecret: paymentIntent.client_secret } });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { createPaymentIntent };
