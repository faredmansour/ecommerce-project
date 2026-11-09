const { PROVIDERS } = require("./providerIdentifiers");

const CONFIG_ENVIRONMENTS = Object.freeze(["TEST", "LIVE"]);
const FIELD_DEFINITIONS = Object.freeze({
  [PROVIDERS.PAYMOB]: Object.freeze([
    Object.freeze({ field: "API_BASE_URL", kind: "url" }),
    Object.freeze({ field: "PUBLIC_KEY", kind: "value" }),
    Object.freeze({ field: "SECRET_KEY", kind: "secret" }),
    Object.freeze({ field: "INTEGRATION_ID", kind: "value" }),
  ]),
  [PROVIDERS.KASHIER]: Object.freeze([
    Object.freeze({ field: "API_BASE_URL", kind: "url" }),
    Object.freeze({ field: "API_KEY", kind: "secret" }),
    Object.freeze({ field: "SECRET_KEY", kind: "secret" }),
    Object.freeze({ field: "MERCHANT_ID", kind: "value" }),
  ]),
  [PROVIDERS.FAWRY]: Object.freeze([
    Object.freeze({ field: "API_BASE_URL", kind: "url" }),
    Object.freeze({ field: "MERCHANT_CODE", kind: "value" }),
    Object.freeze({ field: "SECURITY_KEY", kind: "secret" }),
  ]),
});

// Preserve the existing field contract for internal callers and tests.
const ENV_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(FIELD_DEFINITIONS).map(([provider, fields]) => [provider, Object.freeze(fields.map(({ field }) => field))])
));

const LEGACY_UNSCOPED_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(FIELD_DEFINITIONS).map(([provider, fields]) => [
    provider,
    Object.freeze(fields.map(({ field }) => `${provider.toUpperCase()}_${field}`)),
  ])
));
const OPTIONAL_SECRET_FIELDS = Object.freeze({
  [PROVIDERS.PAYMOB]: Object.freeze(["API_KEY"]),
});
const VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

function configurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validValue(value, kind) {
  if (!hasValue(value)) return false;
  if (kind !== "url") return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function referencesFor(provider, environment) {
  const prefix = provider.toUpperCase();
  if (!environment) return Object.freeze([]);
  return Object.freeze(FIELD_DEFINITIONS[provider].map(({ field }) => `${prefix}_${environment}_${field}`));
}

function hasAnyProviderValues(provider, env) {
  const prefix = provider.toUpperCase();
  const namespaced = CONFIG_ENVIRONMENTS.flatMap((environment) => referencesFor(provider, environment));
  return [...namespaced, ...LEGACY_UNSCOPED_KEYS[provider]].some((key) => hasValue(env[key]));
}

function makeResult({ provider, environment = null, status, reasonCode, missingKeys = [], invalidKeys = [], secretReferences = [] }) {
  return Object.freeze({
    provider,
    environment,
    status,
    reasonCode,
    configured: status === "CONFIGURED",
    enabled: false,
    runtimeStatus: "DISABLED",
    missingCount: missingKeys.length,
    missingKeys: Object.freeze([...missingKeys]),
    invalidKeys: Object.freeze([...invalidKeys]),
    secretReferences: Object.freeze([...secretReferences]),
  });
}

function webhookSecretError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireWebhookSecretScope(provider, environment, env) {
  if (!Object.prototype.hasOwnProperty.call(FIELD_DEFINITIONS, provider)) {
    throw webhookSecretError("UNKNOWN_PROVIDER", "Payment provider is unknown.");
  }
  if (!CONFIG_ENVIRONMENTS.includes(environment)) {
    throw webhookSecretError("PROVIDER_ENVIRONMENT_INVALID", "Provider environment is invalid.");
  }
  if (!env || env[`${provider.toUpperCase()}_ENVIRONMENT`] !== environment) {
    throw webhookSecretError("PROVIDER_ENVIRONMENT_MISMATCH", "Provider environment does not match trusted configuration.");
  }
}

function parseVersionList(value) {
  if (!hasValue(value)) return [];
  const versions = value.split(",").map((version) => version.trim());
  if (versions.some((version) => !VERSION_PATTERN.test(version)) || new Set(versions).size !== versions.length) {
    throw webhookSecretError("WEBHOOK_SECRET_CONFIGURATION_INVALID", "Webhook secret version metadata is invalid.");
  }
  return versions;
}

function getWebhookSecretMetadata({ provider, environment }, { env = process.env, now = new Date() } = {}) {
  requireWebhookSecretScope(provider, environment, env);
  if (provider === PROVIDERS.PAYMOB) {
    const reference = `${provider.toUpperCase()}_${environment}_HMAC_SECRET`;
    let secret;
    try { secret = env[reference]; } catch { secret = null; }
    return Object.freeze({ provider, environment, verificationStatus: "SUPPORTED",
      active: hasValue(secret) ? Object.freeze({ secretReference: reference, version: "configured", status: "ACTIVE" }) : null,
      previous: null, revokedVersions: Object.freeze([]) });
  }
  if (provider !== PROVIDERS.KASHIER) {
    return Object.freeze({
      provider,
      environment,
      verificationStatus: "UNSUPPORTED_VERIFICATION",
      active: null,
      previous: null,
      revokedVersions: Object.freeze([]),
    });
  }

  const prefix = `${provider.toUpperCase()}_${environment}_`;
  const activeVersion = env[`${prefix}API_KEY_VERSION`];
  const previousVersion = env[`${prefix}PREVIOUS_API_KEY_VERSION`];
  const previousUntil = env[`${prefix}PREVIOUS_API_KEY_VALID_UNTIL`];
  const revokedVersions = parseVersionList(env[`${prefix}REVOKED_API_KEY_VERSIONS`]);
  if ((activeVersion && !VERSION_PATTERN.test(activeVersion)) ||
      (previousVersion && !VERSION_PATTERN.test(previousVersion)) ||
      (previousVersion && (!hasValue(previousUntil) || !Number.isFinite(Date.parse(previousUntil)))) ||
      (!previousVersion && hasValue(previousUntil)) ||
      (activeVersion && previousVersion === activeVersion)) {
    throw webhookSecretError("WEBHOOK_SECRET_CONFIGURATION_INVALID", "Webhook secret version metadata is invalid.");
  }

  const revoked = new Set(revokedVersions);
  const nowMillis = now instanceof Date ? now.getTime() : Number(now);
  const previousStatus = previousVersion
    ? (revoked.has(previousVersion) || Date.parse(previousUntil) <= nowMillis ? "REVOKED" : "PREVIOUS")
    : null;
  return Object.freeze({
    provider,
    environment,
    verificationStatus: "SUPPORTED",
    active: hasValue(activeVersion) ? Object.freeze({
      secretReference: `${prefix}API_KEY`,
      version: activeVersion,
      status: revoked.has(activeVersion) ? "REVOKED" : "ACTIVE",
    }) : null,
    previous: hasValue(previousVersion) ? Object.freeze({
      version: previousVersion,
      validUntil: new Date(previousUntil).toISOString(),
      status: previousStatus,
    }) : null,
    revokedVersions: Object.freeze(revokedVersions),
  });
}

/** Resolve a configured server-side provider secret for one trusted environment. */
function resolveProviderSecret({ provider, environment, field }, { env = process.env, secretResolver = (reference) => env[reference] } = {}) {
  requireWebhookSecretScope(provider, environment, env);
  const definition = FIELD_DEFINITIONS[provider]?.find((candidate) => candidate.field === field);
  const optionalSecret = OPTIONAL_SECRET_FIELDS[provider]?.includes(field);
  if ((!definition && !optionalSecret) || (definition && definition.kind !== "secret")) {
    throw webhookSecretError("PROVIDER_SECRET_REFERENCE_INVALID", "Provider secret reference is invalid.");
  }
  const reference = `${provider.toUpperCase()}_${environment}_${field}`;
  let secretValue;
  try {
    secretValue = secretResolver(reference);
  } catch {
    throw webhookSecretError("PROVIDER_SECRET_UNAVAILABLE", "Provider secret is unavailable.");
  }
  if (!hasValue(secretValue)) {
    throw webhookSecretError("PROVIDER_SECRET_MISSING", "Provider secret is unavailable.");
  }
  return Object.freeze({ secretReference: reference, secretValue });
}

/** Resolve only the active Kashier webhook key for the trusted TEST/LIVE scope. */
function resolveWebhookSecret({ provider, environment, secretVersion } = {}, {
  env = process.env,
  secretResolver = (reference) => env[reference],
  now = new Date(),
} = {}) {
  const metadata = getWebhookSecretMetadata({ provider, environment }, { env, now });
  if (provider === PROVIDERS.PAYMOB) {
    if (!metadata.active || (secretVersion && secretVersion !== "configured")) {
      throw webhookSecretError("WEBHOOK_SECRET_MISSING", "Environment-scoped webhook secret is unavailable.");
    }
    const secretValue = secretResolver(metadata.active.secretReference);
    if (!hasValue(secretValue)) throw webhookSecretError("WEBHOOK_SECRET_MISSING", "Environment-scoped webhook secret is unavailable.");
    return Object.freeze({ secretValue, secretReference: metadata.active.secretReference, version: "configured", status: "ACTIVE" });
  }
  if (metadata.verificationStatus !== "SUPPORTED") {
    throw webhookSecretError("WEBHOOK_VERIFICATION_UNSUPPORTED", "Webhook verification is unsupported for this provider.");
  }
  if (!metadata.active) {
    throw webhookSecretError("WEBHOOK_SECRET_MISSING", "Environment-scoped webhook secret is unavailable.");
  }
  const requestedVersion = secretVersion ?? metadata.active.version;
  if (metadata.revokedVersions.includes(requestedVersion) || metadata.active.status === "REVOKED" && requestedVersion === metadata.active.version) {
    throw webhookSecretError("WEBHOOK_SECRET_REVOKED", "Webhook secret version is revoked.");
  }
  if (metadata.previous?.version === requestedVersion) {
    if (metadata.previous.status === "REVOKED") {
      throw webhookSecretError("WEBHOOK_SECRET_EXPIRED", "Previous webhook secret version is no longer valid.");
    }
    // Provider documentation reviewed by this project does not establish safe
    // overlapping-key rotation. Previous versions are metadata only and are
    // never resolved for signature verification.
    throw webhookSecretError("WEBHOOK_SECRET_PREVIOUS_NOT_ACCEPTED", "Previous webhook secret versions are not accepted.");
  }
  if (requestedVersion !== metadata.active.version) {
    throw webhookSecretError("WEBHOOK_SECRET_VERSION_UNKNOWN", "Webhook secret version is unavailable.");
  }
  let secretValue;
  try {
    secretValue = secretResolver(metadata.active.secretReference);
  } catch {
    throw webhookSecretError("WEBHOOK_SECRET_UNAVAILABLE", "Webhook secret is unavailable.");
  }
  if (!hasValue(secretValue)) {
    throw webhookSecretError("WEBHOOK_SECRET_MISSING", "Environment-scoped webhook secret is unavailable.");
  }
  return Object.freeze({
    secretValue,
    secretReference: metadata.active.secretReference,
    version: metadata.active.version,
    status: "ACTIVE",
  });
}

/**
 * Locally validates one provider's explicitly selected TEST/LIVE configuration.
 * The secretResolver may later be backed by a secret manager; its values are
 * consumed only for presence/shape checks and never leave this function.
 */
function readProviderConfig(provider, env = process.env, secretResolver = (reference) => env[reference]) {
  if (!Object.prototype.hasOwnProperty.call(FIELD_DEFINITIONS, provider)) {
    throw configurationError("UNKNOWN_PROVIDER", "Payment provider is unknown.");
  }
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return makeResult({ provider, status: "INVALID", reasonCode: "PROVIDER_CONFIGURATION_INVALID", invalidKeys: ["environment-source"] });
  }
  const prefix = provider.toUpperCase();
  const environment = env[`${prefix}_ENVIRONMENT`];
  if (environment !== undefined && environment !== "" && !CONFIG_ENVIRONMENTS.includes(environment)) {
    return makeResult({ provider, status: "INVALID", reasonCode: "PROVIDER_ENVIRONMENT_INVALID", invalidKeys: [`${prefix}_ENVIRONMENT`] });
  }

  if (!CONFIG_ENVIRONMENTS.includes(environment)) {
    const anyValues = hasAnyProviderValues(provider, env);
    const legacyValues = LEGACY_UNSCOPED_KEYS[provider].filter((key) => hasValue(env[key]));
    if (!anyValues) {
      return makeResult({
        provider,
        status: "MISSING",
        reasonCode: "PROVIDER_CONFIGURATION_MISSING",
        missingKeys: ENV_KEYS[provider],
      });
    }
    return makeResult({
      provider,
      status: "INCOMPLETE",
      reasonCode: "PROVIDER_ENVIRONMENT_REQUIRED",
      missingKeys: legacyValues.length ? ["environment-scoped-configuration-required"] : [`${prefix}_ENVIRONMENT`],
    });
  }

  const references = referencesFor(provider, environment);
  const missingKeys = [];
  const invalidKeys = [];
  const secretReferences = [];
  let suppliedCount = 0;
  for (let index = 0; index < FIELD_DEFINITIONS[provider].length; index += 1) {
    const definition = FIELD_DEFINITIONS[provider][index];
    const reference = references[index];
    if (definition.kind === "secret") secretReferences.push(reference);
    let value;
    try {
      value = definition.kind === "secret" ? secretResolver(reference) : env[reference];
    } catch {
      invalidKeys.push(definition.field);
      continue;
    }
    if (!hasValue(value)) {
      missingKeys.push(definition.field);
      continue;
    }
    suppliedCount += 1;
    if (!validValue(value, definition.kind)) invalidKeys.push(definition.field);
  }

  if (invalidKeys.length) {
    return makeResult({ provider, environment, status: "INVALID", reasonCode: "PROVIDER_CONFIGURATION_INVALID", missingKeys, invalidKeys, secretReferences });
  }
  if (missingKeys.length) {
    const status = suppliedCount === 0 ? "MISSING" : "INCOMPLETE";
    return makeResult({
      provider,
      environment,
      status,
      reasonCode: status === "MISSING" ? "PROVIDER_CONFIGURATION_MISSING" : "PROVIDER_CONFIGURATION_INCOMPLETE",
      missingKeys,
      secretReferences,
    });
  }
  return makeResult({ provider, environment, status: "CONFIGURED", reasonCode: "PROVIDER_CONFIGURATION_READY", secretReferences });
}

module.exports = {
  CONFIG_ENVIRONMENTS,
  ENV_KEYS,
  FIELD_DEFINITIONS,
  readProviderConfig,
  getWebhookSecretMetadata,
  resolveWebhookSecret,
  resolveProviderSecret,
};
