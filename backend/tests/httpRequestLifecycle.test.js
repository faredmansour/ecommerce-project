const EventEmitter = require("events");
const { createHttpRequestLifecycle } = require("../services/httpRequestLifecycle");

function createResponse() {
  const response = new EventEmitter();
  response.writableFinished = false;
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

describe("HTTP request lifecycle", () => {
  it("tracks a request until its response finishes", () => {
    const lifecycle = createHttpRequestLifecycle();
    const response = createResponse();

    lifecycle.middleware({}, response, jest.fn());
    expect(lifecycle.getStatus()).toMatchObject({ acceptingRequests: true, activeRequestCount: 1 });

    response.writableFinished = true;
    response.emit("finish");
    expect(lifecycle.getStatus().activeRequestCount).toBe(0);
  });

  it("releases a request after its handler throws and the error response finishes", () => {
    const lifecycle = createHttpRequestLifecycle();
    const response = createResponse();

    expect(() => lifecycle.middleware({}, response, () => {
      throw new Error("handler failed");
    })).toThrow("handler failed");
    expect(lifecycle.getStatus().activeRequestCount).toBe(1);

    response.writableFinished = true;
    response.emit("finish");
    expect(lifecycle.getStatus().activeRequestCount).toBe(0);
  });

  it("rejects new application work after shutdown begins", () => {
    const lifecycle = createHttpRequestLifecycle();
    lifecycle.stopAccepting();
    const response = createResponse();
    const next = jest.fn();

    lifecycle.middleware({}, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "SERVER_SHUTTING_DOWN" }));
    expect(lifecycle.getStatus()).toMatchObject({ acceptingRequests: false, activeRequestCount: 0 });
  });

  it("does not mistake a premature socket close for handler completion", async () => {
    const lifecycle = createHttpRequestLifecycle();
    const response = createResponse();

    lifecycle.middleware({}, response, jest.fn());
    response.emit("close");
    let drained = false;
    const drain = lifecycle.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);

    response.writableFinished = true;
    response.emit("finish");
    await drain;
    expect(lifecycle.getStatus().activeRequestCount).toBe(0);
  });
});
