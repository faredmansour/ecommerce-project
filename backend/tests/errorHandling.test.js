jest.mock("../utils/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

const errorHandler = require("../middlewares/errorHandler");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("error response security", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it("hides internal 500 details in production", () => {
    process.env.NODE_ENV = "production";
    const res = createResponse();
    const error = new Error("Mongo connection string contains secrets");

    errorHandler(error, { method: "GET", originalUrl: "/api/example" }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: "error", message: "Internal server error" });
  });

  it("preserves safe operational validation messages in production", () => {
    process.env.NODE_ENV = "production";
    const res = createResponse();

    errorHandler(new AppError("Email is invalid", 400), { method: "POST", originalUrl: "/api/auth/register" }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ status: "fail", message: "Email is invalid" });
  });

  it("redacts query strings and error details from request error logs", () => {
    process.env.NODE_ENV = "production";
    const res = createResponse();
    const secrets = [
      "oauth-code-test-value",
      "oauth-state-test-value",
      "reset-token-test-value",
      "verification-token-test-value",
      "access-token-test-value",
      "refresh-token-test-value",
      "password-test-value",
      "smtp-secret-test-value",
    ];
    const req = {
      requestId: "7b5ee3a2-0fc0-4b9d-a32d-5e55b71d7c58",
      method: "GET",
      path: "/api/auth/google/callback",
      originalUrl: `/api/auth/google/callback?code=${secrets[0]}&state=${secrets[1]}&token=${secrets[2]}&verification=${secrets[3]}&accessToken=${secrets[4]}&refreshToken=${secrets[5]}&password=${secrets[6]}&smtp=${secrets[7]}`,
    };
    const error = new Error(`Sensitive test values: ${secrets.join(" ")}`);
    error.statusCode = 500;

    errorHandler(error, req, res, jest.fn());

    expect(logger.error).toHaveBeenCalledTimes(1);
    const log = logger.error.mock.calls[0][0];
    expect(log).toContain(req.requestId);
    expect(log).toContain("GET");
    expect(log).toContain("/api/auth/google/callback");
    expect(log).toContain('"statusCode":500');
    for (const secret of secrets) expect(log).not.toContain(secret);
  });
});