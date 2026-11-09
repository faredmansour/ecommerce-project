import CategoryPage from "./CategoryPage";

/**
 * ProductListingPage – a wrapper around the existing CategoryPage component.
 * The backend already supports filtering, sorting, and pagination via query
 * parameters (category, search, limit, page, etc.).  By re‑using CategoryPage we
 * avoid duplicating logic while providing a distinct route (/products) for the
 * general product catalogue.
 */
export default function ProductListingPage() {
  return <CategoryPage />;
}
