const PaymentExecutionAttempt = require("../models/paymentExecutionAttemptModel");
const { encryptCheckoutUrl, decryptCheckoutUrlWithMetadata, shouldRotateCheckoutUrl } = require("../utils/paymobCheckoutResultCrypto");

async function hydrateCheckoutUrl(attempt, env) {
  if (!attempt) return null;
  const metadata = decryptCheckoutUrlWithMetadata(attempt.checkoutUrlEncrypted, env);
  if (metadata.checkoutUrl && shouldRotateCheckoutUrl(attempt.checkoutUrlEncrypted, metadata, env)) {
    const rotated = encryptCheckoutUrl(metadata.checkoutUrl, env);
    await PaymentExecutionAttempt.updateOne({
      _id: attempt._id,
      checkoutUrlEncrypted: attempt.checkoutUrlEncrypted,
    }, { $set: { checkoutUrlEncrypted: rotated } });
  }
  return { ...attempt, checkoutUrl: metadata.checkoutUrl };
}

class PaymentExecutionAttemptRepository {
  constructor({ env = process.env } = {}) {
    this.env = env;
  }

  findPaymobSessionByOrderReference(providerReference, session) {
    return PaymentExecutionAttempt.findOne({ provider: "paymob", status: "SESSION_CREATED", providerReference })
      .select("paymentId providerPaymentId providerReference")
      .session(session || null).lean();
  }

  findPaymobSessionByPaymentId(paymentId) {
    return PaymentExecutionAttempt.findOne({ provider: "paymob", status: "SESSION_CREATED", paymentId })
      .select("+checkoutUrlEncrypted paymentId orderId providerPaymentId providerReference status sessionCreatedAt")
      .lean().then((attempt) => hydrateCheckoutUrl(attempt, this.env));
  }

  findByPaymentId(paymentId) {
    return PaymentExecutionAttempt.findOne({ paymentId })
      .select("+checkoutUrlEncrypted paymentId orderId provider providerPaymentId providerReference status errorCode createdAt updatedAt sessionCreatedAt recoveryRequiredAt")
      .lean().then((attempt) => hydrateCheckoutUrl(attempt, this.env));
  }

  async reserve({ paymentId, orderId, provider }) {
    try {
      await PaymentExecutionAttempt.create({ paymentId, orderId, provider, status: "REQUESTING" });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  mark(paymentId, status, { providerPaymentId = null, providerReference = null, checkoutUrl = null, errorCode = null } = {}) {
    const checkoutUrlEncrypted = checkoutUrl ? encryptCheckoutUrl(checkoutUrl, this.env) : null;
    return PaymentExecutionAttempt.updateOne({ paymentId, status: "REQUESTING" }, {
      $set: {
        status, providerPaymentId, providerReference, checkoutUrlEncrypted, errorCode,
        ...(status === "SESSION_CREATED" ? { sessionCreatedAt: new Date() } : {}),
        ...(status === "UNKNOWN" ? { recoveryRequiredAt: new Date() } : {}),
      },
    });
  }
}

module.exports = PaymentExecutionAttemptRepository;
