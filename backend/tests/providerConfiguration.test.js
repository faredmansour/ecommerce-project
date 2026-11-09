const fs = require("fs");
const path = require("path");
const { PROVIDERS, getProviderCapabilities, resolveProvider, PROVIDER_ERROR_CODES } = require("../providers");
const { CONFIG_ENVIRONMENTS, ENV_KEYS, readProviderConfig, resolveProviderSecret } = require("../providers/providerConfig");
const { getOptionalProviderConfigurationDiagnostics, logOptionalProviderConfigurationDiagnostics } = require("../providers/providerConfigurationDiagnostics");
const { PaymentMethodAvailabilityService } = require("../services/paymentMethodAvailabilityService");
const { METHOD } = require("../services/paymentMethodRegistry");
const Payment = require("../models/paymentModel");
const Order = require("../models/orderModel");
const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");
const PaymentWebhookEvent = require("../models/paymentWebhookEventModel");
const PaymentReconciliationRecord = require("../models/paymentReconciliationRecordModel");

const placeholder = "unit-test-only-placeholder";

function configuredEnvironment(provider, environment) {
  const prefix = provider.toUpperCase();
  const env = { [`${prefix}_ENVIRONMENT`]: environment };
  for (const field of ENV_KEYS[provider]) {
    const key = `${prefix}_${environment}_${field}`;
    env[key] = field === "API_BASE_URL" ? "https://gateway.example.invalid" : placeholder;
  }
  return env;
}

describe("provider configuration and secret boundary", () => {
  it("documents every consumed Paymob TEST variable with safe disabled defaults", () => {
    const examplePath = path.join(__dirname, "..", "connection", "config.env.example");
    const entries = fs.readFileSync(examplePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
      .filter(Boolean);
    const values = Object.fromEntries(entries.map(([, key, value]) => [key, value]));
    const requiredNames = [
      "PAYMOB_ENVIRONMENT",
      "PAYMOB_TEST_EXECUTION_ENABLED",
      "PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED",
      "PAYMOB_TEST_API_BASE_URL",
      "PAYMOB_TEST_API_KEY",
      "PAYMOB_TEST_PUBLIC_KEY",
      "PAYMOB_TEST_SECRET_KEY",
      "PAYMOB_TEST_HMAC_SECRET",
      "PAYMOB_TEST_INTEGRATION_ID",
      "PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY",
      "PAYMOB_CHECKOUT_RESULT_KEYRING",
      "PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID",
    ];

    expect(Object.keys(values)).toEqual(expect.arrayContaining(requiredNames));
    expect(values).toMatchObject({
      PAYMOB_ENVIRONMENT: "TEST",
      PAYMOB_TEST_EXECUTION_ENABLED: "false",
      PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED: "false",
      PAYMOB_TEST_API_BASE_URL: "https://accept.paymob.com",
      PAYMOB_TEST_API_KEY: "",
      PAYMOB_TEST_PUBLIC_KEY: "",
      PAYMOB_TEST_SECRET_KEY: "",
      PAYMOB_TEST_HMAC_SECRET: "",
      PAYMOB_TEST_INTEGRATION_ID: "",
      PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY: "",
      PAYMOB_CHECKOUT_RESULT_KEYRING: "",
      PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID: "",
    });
    expect(Object.keys(values).some((key) => /^PAYMOB_LIVE_/.test(key))).toBe(false);
  });

  it("reports missing, incomplete, invalid, and configured states deterministically", () => {
    for (const provider of Object.values(PROVIDERS)) {
      expect(readProviderConfig(provider, {})).toMatchObject({
        status: "MISSING",
        reasonCode: "PROVIDER_CONFIGURATION_MISSING",
        configured: false,
        enabled: false,
        runtimeStatus: "DISABLED",
        missingCount: ENV_KEYS[provider].length,
      });
    }

    const partial = {
      PAYMOB_ENVIRONMENT: "TEST",
      PAYMOB_TEST_API_BASE_URL: "https://gateway.example.invalid",
    };
    expect(readProviderConfig(PROVIDERS.PAYMOB, partial)).toMatchObject({
      status: "INCOMPLETE",
      reasonCode: "PROVIDER_CONFIGURATION_INCOMPLETE",
      missingKeys: expect.arrayContaining(["SECRET_KEY", "INTEGRATION_ID"]),
    });

    const invalid = configuredEnvironment(PROVIDERS.PAYMOB, "TEST");
    invalid.PAYMOB_TEST_API_BASE_URL = "http://gateway.example.invalid";
    expect(readProviderConfig(PROVIDERS.PAYMOB, invalid)).toMatchObject({
      status: "INVALID",
      reasonCode: "PROVIDER_CONFIGURATION_INVALID",
      invalidKeys: ["API_BASE_URL"],
    });

    for (const provider of Object.values(PROVIDERS)) {
      expect(readProviderConfig(provider, configuredEnvironment(provider, "TEST"))).toMatchObject({
        status: "CONFIGURED",
        reasonCode: "PROVIDER_CONFIGURATION_READY",
        configured: true,
        enabled: false,
        runtimeStatus: "DISABLED",
      });
    }
  });

  it("rejects unknown providers and unknown or implicit environments", () => {
    expect(() => readProviderConfig("stripe", {})).toThrow(expect.objectContaining({ code: "UNKNOWN_PROVIDER" }));
    expect(readProviderConfig(PROVIDERS.PAYMOB, null)).toMatchObject({ status: "INVALID", reasonCode: "PROVIDER_CONFIGURATION_INVALID" });
    expect(readProviderConfig(PROVIDERS.KASHIER, { KASHIER_ENVIRONMENT: "SANDBOX" }))
      .toMatchObject({ status: "INVALID", reasonCode: "PROVIDER_ENVIRONMENT_INVALID", runtimeStatus: "DISABLED" });
    expect(readProviderConfig(PROVIDERS.KASHIER, { KASHIER_API_KEY: placeholder }))
      .toMatchObject({ status: "INCOMPLETE", reasonCode: "PROVIDER_ENVIRONMENT_REQUIRED" });
    expect(readProviderConfig(PROVIDERS.KASHIER, { KASHIER_API_KEY: placeholder, KASHIER_ENVIRONMENT: "TEST" }))
      .toMatchObject({ status: "MISSING", environment: "TEST" });
  });

  it("keeps TEST and LIVE configuration separate with no fallback", () => {
    for (const provider of Object.values(PROVIDERS)) {
      const testEnv = configuredEnvironment(provider, "TEST");
      expect(readProviderConfig(provider, testEnv)).toMatchObject({ status: "CONFIGURED", environment: "TEST" });
      testEnv[`${provider.toUpperCase()}_ENVIRONMENT`] = "LIVE";
      expect(readProviderConfig(provider, testEnv)).toMatchObject({
        status: "MISSING",
        environment: "LIVE",
        configured: false,
      });
      const liveEnv = configuredEnvironment(provider, "LIVE");
      expect(readProviderConfig(provider, liveEnv)).toMatchObject({ status: "CONFIGURED", environment: "LIVE" });
    }
    expect(CONFIG_ENVIRONMENTS).toEqual(["TEST", "LIVE"]);

    const apiKeyOnly = {
      PAYMOB_ENVIRONMENT: "TEST",
      PAYMOB_TEST_API_BASE_URL: "https://accept.paymob.com",
      PAYMOB_TEST_PUBLIC_KEY: "test-public-key-placeholder",
      PAYMOB_TEST_API_KEY: placeholder,
      PAYMOB_TEST_INTEGRATION_ID: "12345",
    };
    expect(readProviderConfig(PROVIDERS.PAYMOB, apiKeyOnly)).toMatchObject({
      status: "INCOMPLETE",
      configured: false,
      missingKeys: ["SECRET_KEY"],
    });
  });

  it("resolves the optional Paymob TEST API Key without making it part of provider readiness", () => {
    const env = {
      PAYMOB_ENVIRONMENT: "TEST",
      PAYMOB_TEST_API_KEY: placeholder,
      PAYMOB_API_KEY: "unscoped-unit-test-key",
    };
    const resolved = resolveProviderSecret(
      { provider: PROVIDERS.PAYMOB, environment: "TEST", field: "API_KEY" },
      { env }
    );
    expect(resolved).toMatchObject({ secretReference: "PAYMOB_TEST_API_KEY", secretValue: placeholder });
    expect(readProviderConfig(PROVIDERS.PAYMOB, env)).toMatchObject({ configured: false, runtimeStatus: "DISABLED" });
    expect(JSON.stringify(readProviderConfig(PROVIDERS.PAYMOB, env))).not.toContain(placeholder);
    expect(() => resolveProviderSecret(
      { provider: PROVIDERS.PAYMOB, environment: "TEST", field: "API_KEY" },
      { env: { PAYMOB_ENVIRONMENT: "TEST", PAYMOB_API_KEY: placeholder } }
    )).toThrow(expect.objectContaining({ code: "PROVIDER_SECRET_MISSING" }));
  });

  it("returns secret references but never secret values, including resolver errors", () => {
    const env = configuredEnvironment(PROVIDERS.KASHIER, "TEST");
    const result = readProviderConfig(PROVIDERS.KASHIER, env, () => placeholder);
    expect(result.secretReferences).toEqual([
      "KASHIER_TEST_API_KEY",
      "KASHIER_TEST_SECRET_KEY",
    ]);
    expect(JSON.stringify(result)).not.toContain(placeholder);

    const invalidSecretResolver = readProviderConfig(PROVIDERS.KASHIER, env, () => {
      throw new Error(`private secret ${placeholder}`);
    });
    expect(invalidSecretResolver).toMatchObject({ status: "INVALID", invalidKeys: expect.arrayContaining(["API_KEY"]) });
    expect(JSON.stringify(invalidSecretResolver)).not.toContain(placeholder);
  });

  it("does not persist configuration values or secret material", async () => {
    const models = [Payment, Order, PaymentLedgerEntry, PaymentWebhookEvent, PaymentReconciliationRecord];
    const before = await Promise.all(models.map((model) => model.countDocuments()));
    readProviderConfig(PROVIDERS.FAWRY, configuredEnvironment(PROVIDERS.FAWRY, "TEST"));
    const after = await Promise.all(models.map((model) => model.countDocuments()));
    expect(after).toEqual(before);
  });

  it("emits safe startup diagnostics without blocking for optional missing configuration", () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    expect(logOptionalProviderConfigurationDiagnostics({ env: {}, logger })).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();

    const configured = configuredEnvironment(PROVIDERS.PAYMOB, "TEST");
    const incomplete = { KASHIER_ENVIRONMENT: "LIVE", KASHIER_LIVE_API_BASE_URL: "not-a-url", KASHIER_LIVE_API_KEY: placeholder };
    const diagnostics = getOptionalProviderConfigurationDiagnostics({ ...configured, ...incomplete });
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: PROVIDERS.PAYMOB, configurationStatus: "CONFIGURED", runtimeStatus: "DISABLED" }),
      expect.objectContaining({ provider: PROVIDERS.KASHIER, configurationStatus: "INVALID", invalidFields: ["API_BASE_URL"] }),
    ]));
    logOptionalProviderConfigurationDiagnostics({ env: { ...configured, ...incomplete }, logger });
    const logOutput = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(logOutput).not.toContain(placeholder);
    expect(logOutput).not.toContain("not-a-url");
  });

  it("never enables providers or constructs adapters from readiness alone", () => {
    for (const provider of Object.values(PROVIDERS)) {
      const config = readProviderConfig(provider, configuredEnvironment(provider, "LIVE"));
      expect(config).toMatchObject({ status: "CONFIGURED", runtimeStatus: "DISABLED", enabled: false });
      expect(getProviderCapabilities(provider).runtime).toMatchObject({ enabled: false, availableMethods: [] });
      expect(() => resolveProvider(provider)).toThrow(expect.objectContaining({ code: PROVIDER_ERROR_CODES.DISABLED }));
    }
  });

  it("keeps configured-but-disabled and unconfigured methods unavailable", () => {
    for (const provider of Object.values(PROVIDERS)) {
      const config = readProviderConfig(provider, configuredEnvironment(provider, "TEST"));
      expect(config.configured).toBe(true);
      expect(getProviderCapabilities(provider).runtime.enabled).toBe(false);
    }
    const availability = new PaymentMethodAvailabilityService();
    expect(availability.getMethodAvailability(METHOD.CARD, { currency: "EGP", country: "EG", amountMinor: 100 }))
      .toMatchObject({ status: "UNAVAILABLE", reasonCode: "PROVIDER_DISABLED" });
    expect(availability.getMethodAvailability(METHOD.MEEZA, { currency: "EGP", country: "EG", amountMinor: 100 }))
      .toMatchObject({ status: "UNAVAILABLE" });
  });
});
