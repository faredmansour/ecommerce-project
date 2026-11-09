// HomePage tests adapted for Node's built‑in test runner
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomePage from "./HomePage";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Manual mock of the API used by HomePage
import * as apiModule from "../services/api.jsx";
const originalGetAll = apiModule.productsAPI.getAll;

function restoreApi() {
  apiModule.productsAPI.getAll = originalGetAll;
}

afterEach(() => {
  restoreApi();
});

function renderWithRouter(ui, { route = "/" } = {}) {
  window.history.pushState({}, "Test page", route);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="*" element={ui} />
        {/* Dummy routes for navigation expectations */}
        <Route path="/category" element={<div>Category page</div>} />
        <Route path="/search" element={<div>Search page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test("loads and displays featured products (limit:6)", async () => {
  const mockProducts = [
    { _id: "p1", name: "Test Product 1", price: 10, image: "/img1.png" },
    { _id: "p2", name: "Test Product 2", price: 20, image: "/img2.png" },
  ];
  apiModule.productsAPI.getAll = async () => ({ data: mockProducts });

  renderWithRouter(<HomePage />);

  // Loading state – the Featured heading should not be present initially
  assert.strictEqual(screen.queryByText(/Featured Products/i), null);

  // Wait for async load to complete and heading to appear
  await waitFor(() => {
    assert.ok(screen.getByText(/Featured Products/i));
  });

  // Verify that product names are rendered (ProductCard renders a link with the name)
  assert.ok(screen.getByRole("link", { name: /Test Product 1/i }));
  assert.ok(screen.getByRole("link", { name: /Test Product 2/i }));

  // Ensure the API was called with the expected limit param
  // Since we replaced the function directly we can inspect the arguments via a wrapper
  let capturedArgs;
  apiModule.productsAPI.getAll = async (...args) => {
    capturedArgs = args;
    return { data: mockProducts };
  };
  // Re‑render to trigger the call
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  assert.deepStrictEqual(capturedArgs, [undefined, undefined, { limit: 6 }]);
});

test("renders empty state when API returns no products", async () => {
  apiModule.productsAPI.getAll = async () => ({ data: [] });
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  assert.strictEqual(screen.queryByText(/Featured Products/i), null);
});

test("handles API failure gracefully", async () => {
  apiModule.productsAPI.getAll = async () => {
    throw new Error("Network error");
  };
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  assert.strictEqual(screen.queryByText(/Featured Products/i), null);
});

test("search input navigates with correct query parameter", async () => {
  apiModule.productsAPI.getAll = async () => ({ data: [] });
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  const searchInput = screen.getByPlaceholderText(/Search products/i);
  await userEvent.type(searchInput, "shirt{Enter}");
  assert.strictEqual(window.location.pathname + window.location.search, "/category?search=shirt");
});

test("arena category cards link to correct destinations", async () => {
  apiModule.productsAPI.getAll = async () => ({ data: [] });
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  const gamingLink = screen.getByRole("link", { name: /GAMING/i });
  const techLink = screen.getByRole("link", { name: /TECHNOLOGY/i });
  assert.strictEqual(gamingLink.getAttribute("href"), "/category?search=gaming");
  assert.strictEqual(techLink.getAttribute("href"), "/category?search=technology");
});

test("does not render unsupported promotional content", async () => {
  apiModule.productsAPI.getAll = async () => ({ data: [] });
  renderWithRouter(<HomePage />);
  await waitFor(() => {});
  const forbidden = [/Real Madrid/i, /countdown/i, /promo/i, /EUR/i];
  forbidden.forEach((re) => {
    assert.strictEqual(screen.queryByText(re), null);
  });
});
