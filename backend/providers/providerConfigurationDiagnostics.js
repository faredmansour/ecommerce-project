const { PROVIDERS } = require("./providerIdentifiers");
const { readProviderConfig } = require("./providerConfig");

function getOptionalProviderConfigurationDiagnostics(env = process.env) {
  return Object.values(PROVIDERS)
    .map((provider) => readProviderConfig(provider, env))
    .filter((status) => status.status !== "MISSING")
    .map((status) => Object.freeze({
      event: "payment_provider.configuration_status",
      provider: status.provider,
      environment: status.environment,
      configurationStatus: status.status,
      runtimeStatus: "DISABLED",
      reasonCode: status.reasonCode,
      missingCount: status.missingCount,
      invalidFields: status.invalidKeys,
    }));
}

function logOptionalProviderConfigurationDiagnostics({ env = process.env, logger = console } = {}) {
  const diagnostics = getOptionalProviderConfigurationDiagnostics(env);
  for (const diagnostic of diagnostics) {
    const write = diagnostic.configurationStatus === "CONFIGURED" ? logger.info : logger.warn;
    if (typeof write === "function") write.call(logger, JSON.stringify(diagnostic));
  }
  return diagnostics;
}

module.exports = { getOptionalProviderConfigurationDiagnostics, logOptionalProviderConfigurationDiagnostics };
