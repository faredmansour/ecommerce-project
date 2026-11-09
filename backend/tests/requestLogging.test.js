jest.mock("../utils/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

const logger = require("../utils/logger");
const {
  getSanitizedRoute,
  logControllerError,
  logRequest,
  requestContext,
} = require("../utils/requestLogging");

describe("request logging security", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses a generated correlation ID and excludes query values from request logs", () => {
    const req = {
      method: "GET",
      path: "/api/auth/google/callback",
      originalUrl: "/api/auth/google/callback?code=oauth-code-test&state=oauth-state-test&token=verification-token-test&password=password-test&accessToken=access-token-test&refreshToken=refresh-token-test",
    };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestContext(req, res, next);
    logRequest(req, logger);

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
    const log = logger.info.mock.calls[0][0];
    expect(log).toContain(req.requestId);
    expect(log).toContain("/api/auth/google/callback");
    expect(log).not.toContain("oauth-code-test");
    expect(log).not.toContain("oauth-state-test");
    for (const secret of [
      "verification-token-test",
      "password-test",
      "access-token-test",
      "refresh-token-test",
    ]) {
      expect(log).not.toContain(secret);
    }
  });

  it("redacts long token-like path segments", () => {
    const token = "a".repeat(64);
    expect(getSanitizedRoute({ path: `/api/auth/reset/${token}` }))
      .toBe("/api/auth/reset/:redacted");
  });

  it("does not include error messages, credentials, or tokens in controller logs", () => {
    const req = {
      requestId: "7b5ee3a2-0fc0-4b9d-a32d-5e55b71d7c58",
      method: "POST",
      path: "/api/auth/reset-password",
      originalUrl: "/api/auth/reset-password?token=reset-token-test",
    };
    const error = new Error("password-test access-token-test refresh-token-test verification-token-test");
    error.code = "AUTH_FAILURE";

    logControllerError(req, error, logger);

    const log = logger.error.mock.calls[0][0];
    expect(log).toContain(req.requestId);
    expect(log).toContain("POST");
    expect(log).toContain("/api/auth/reset-password");
    expect(log).toContain('"statusCode":500');
    expect(log).toContain('"errorCode":"AUTH_FAILURE"');
    for (const secret of [
      "reset-token-test",
      "password-test",
      "access-token-test",
      "refresh-token-test",
      "verification-token-test",
    ]) {
      expect(log).not.toContain(secret);
    }
  });
});
