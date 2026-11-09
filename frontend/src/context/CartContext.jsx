import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { cartAPI, productsAPI } from "../services/api";

const CartContext = createContext(undefined);
const GUEST_CART_KEY = "guest-cart-v1";
const mergeKey = (userId) => `guest-cart-merge-v1:${userId || "account"}`;
const readGuestLines = () => {
  try {
    const value = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    const linesByProduct = new Map();
    value.forEach((line) => {
      if (typeof line.product_id !== "string" || line.product_id.length > 128 || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) return;
      const current = linesByProduct.get(line.product_id) || 0;
      linesByProduct.set(line.product_id, Math.min(99, current + line.quantity));
    });
    return [...linesByProduct].map(([product_id, quantity]) => ({ product_id, quantity }));
  } catch {
    return [];
  }
};
const writeGuestLines = (lines) => localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
const getId = (item) => item?.product_id || item?.product?._id || item?._id || item?.id;
const userMergeJobs = new Map();

export function CartProvider({ children }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [unsyncedGuestItems, setUnsyncedGuestItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [mergeStatus, setMergeStatus] = useState("pending");
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const activeUser = useRef(null);
  const userIdentity = user?.id || user?._id || user?.email || "authenticated";

  const resolveGuestLines = useCallback(async (lines = readGuestLines()) => Promise.all(lines.map(async (line) => {
      try {
        const response = await productsAPI.getById(line.product_id);
        const product = response.data;
        return product
          ? { ...product, product_id: line.product_id, quantity: line.quantity, _guest: true }
          : { product_id: line.product_id, quantity: line.quantity, name: "Unavailable product", _guest: true, _unavailable: true };
      } catch (error) {
        return {
          product_id: line.product_id,
          quantity: line.quantity,
          name: "Unavailable product",
          _guest: true,
          _unavailable: true,
          _loadError: error.response?.status === 404 ? "This product is no longer available." : "Product details could not be loaded.",
        };
      }
    })), []);

  const loadGuestCart = useCallback(async () => {
    const lines = readGuestLines();
    setCount(lines.reduce((sum, line) => sum + line.quantity, 0));
    const resolved = await resolveGuestLines(lines);
    setItems(resolved);
    return resolved;
  }, [resolveGuestLines]);

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(true);
      try {
        await loadGuestCart();
        setSyncError("");
        return true;
      } catch {
        setSyncError("Your saved cart could not be loaded. Please try again.");
        return false;
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const response = await cartAPI.getAll();
      const data = response.data.data || [];
      setItems(data);
      setCount(data.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0));
      setSyncError("");
      return true;
    } catch {
      setSyncError("Your account cart could not be loaded. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadGuestCart]);

  const mergeGuestCart = useCallback(async () => {
    if (!isAuthenticated || !user) return false;
    const lines = readGuestLines();
    setMergeStatus("syncing");
    setSyncError("");
    const key = mergeKey(user.id || user._id || user.email);
    if (!lines.length) {
      const refreshed = await refreshCart();
      if (refreshed) {
        localStorage.removeItem(GUEST_CART_KEY);
        localStorage.removeItem(key);
        setUnsyncedGuestItems([]);
        setMergeStatus("ready");
        return true;
      }
      setMergeStatus("failed");
      return false;
    }
    if (userMergeJobs.has(key)) return userMergeJobs.get(key);
    const job = (async () => {
      try {
        let plan;
        try { plan = JSON.parse(localStorage.getItem(key) || "null"); } catch { plan = null; }
        const sameCart = plan?.lines && plan.lines.length === lines.length && plan.lines.every((line) => lines.some((guest) => guest.product_id === line.product_id && guest.quantity === line.guestQuantity));
        if (!sameCart) {
          const response = await cartAPI.getAll();
          const remote = response.data.data || [];
          plan = { lines: lines.map((line) => {
            const existing = remote.find((item) => getId(item) === line.product_id);
            const baseQuantity = Number(existing?.quantity) || 0;
            return { product_id: line.product_id, guestQuantity: line.quantity, baseQuantity, targetQuantity: Math.min(99, baseQuantity + line.quantity) };
          }) };
          localStorage.setItem(key, JSON.stringify(plan));
        }

        const currentResponse = await cartAPI.getAll();
        const currentItems = currentResponse.data.data || [];
        let planUpdated = false;
        plan.lines = plan.lines.map((line) => {
          const current = currentItems.find((item) => getId(item) === line.product_id);
          const currentQuantity = Number(current?.quantity) || 0;
          const baseQuantity = Number.isInteger(line.baseQuantity)
            ? line.baseQuantity
            : Math.max(0, line.targetQuantity - line.guestQuantity);
          if (currentQuantity >= baseQuantity) return { ...line, baseQuantity };
          planUpdated = true;
          return {
            ...line,
            baseQuantity: currentQuantity,
            targetQuantity: Math.min(99, currentQuantity + line.guestQuantity),
          };
        });
        if (planUpdated) localStorage.setItem(key, JSON.stringify(plan));

        const productsById = new Map();
        for (const line of plan.lines) {
          const response = await productsAPI.getById(line.product_id);
          const product = response.data;
          if (!product || product.status !== "active" || product.publicationState !== "published") {
            throw new Error("A product in your saved cart is no longer available.");
          }
          const stock = Number(product.stock);
          if (!Number.isInteger(stock) || stock < 0 || line.targetQuantity > stock) {
            throw new Error(`The requested quantity for ${product.name} exceeds current stock. Update your saved cart and retry.`);
          }
          productsById.set(line.product_id, product);
        }

        for (const line of plan.lines) {
          let response = await cartAPI.getAll();
          let remote = response.data.data || [];
          let existing = remote.find((item) => getId(item) === line.product_id);
          if (existing) {
            if (Number(existing.quantity) !== line.targetQuantity) await cartAPI.update(existing._id, line.targetQuantity);
            continue;
          }
          const product = productsById.get(line.product_id);
          if (!product) throw new Error("A product in your saved cart is no longer available.");
          await cartAPI.add(line.product_id, 1, {
            name: product.name,
            price: product.price || 0,
            category: typeof product.category === "object" ? product.category?.name : product.category,
            image: product.image,
          });
          if (line.targetQuantity > 1) {
            response = await cartAPI.getAll();
            remote = response.data.data || [];
            existing = remote.find((item) => getId(item) === line.product_id);
            if (existing && Number(existing.quantity) !== line.targetQuantity) await cartAPI.update(existing._id, line.targetQuantity);
          }
        }
        const refreshed = await refreshCart();
        if (!refreshed) throw new Error("Your account cart could not be refreshed after merging.");
        localStorage.removeItem(GUEST_CART_KEY);
        localStorage.removeItem(key);
        setUnsyncedGuestItems([]);
        setSyncError("");
        setMergeStatus("ready");
        return true;
      } catch (error) {
        await refreshCart();
        setUnsyncedGuestItems(await resolveGuestLines(lines));
        setSyncError(error.response?.data?.message || error.message || "Your saved cart could not be merged. Retry to continue.");
        setMergeStatus("failed");
        return false;
      }
    })();
    userMergeJobs.set(key, job);
    try { return await job; } finally { userMergeJobs.delete(key); }
  }, [isAuthenticated, refreshCart, resolveGuestLines, user]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      if (activeUser.current === userIdentity) return;
      activeUser.current = userIdentity;
      mergeGuestCart();
    } else {
      activeUser.current = null;
      setMergeStatus("idle");
      setUnsyncedGuestItems([]);
      refreshCart();
    }
  }, [authLoading, isAuthenticated, mergeGuestCart, refreshCart, userIdentity]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return undefined;
    return cartAPI.subscribe(refreshCart);
  }, [authLoading, isAuthenticated, refreshCart]);

  const addItem = useCallback(async (product, quantity = 1) => {
    const productId = getId(product);
    if (!productId || !Number.isInteger(quantity) || quantity < 1) throw new Error("This item cannot be added to the cart.");
    if (isAuthenticated) {
      await cartAPI.add(productId, quantity, {
        name: product.name,
        price: product.price || 0,
        category: typeof product.category === "object" ? product.category?.name : product.category,
        image: product.image,
      });
      await refreshCart();
      return;
    }
    const lines = readGuestLines();
    const existing = lines.find((line) => line.product_id === productId);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    const availableStock = Number(product.stock);
    if (Number.isFinite(availableStock) && nextQuantity > availableStock) {
      throw new Error(`Only ${availableStock} available.`);
    }
    if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
    else lines.push({ product_id: productId, quantity: Math.min(99, quantity) });
    writeGuestLines(lines);
    await loadGuestCart();
  }, [isAuthenticated, loadGuestCart, refreshCart]);

  const removeItem = useCallback(async (item) => {
    if (isAuthenticated) {
      await cartAPI.remove(item._id);
      await refreshCart();
      return;
    }
    const productId = getId(item);
    writeGuestLines(readGuestLines().filter((line) => line.product_id !== productId));
    await loadGuestCart();
  }, [isAuthenticated, loadGuestCart, refreshCart]);

  const updateItem = useCallback(async (item, quantity) => {
    const productId = getId(item);
    if (!productId || !Number.isInteger(quantity)) throw new Error("Choose a valid quantity.");
    if (quantity < 1) return removeItem(item);
    if (isAuthenticated) {
      await cartAPI.update(item._id, quantity);
      await refreshCart();
      return;
    }
    const availableStock = Number(item.stock);
    if (Number.isFinite(availableStock) && quantity > availableStock) {
      throw new Error(`Only ${availableStock} available.`);
    }
    const lines = readGuestLines().map((line) => line.product_id === productId ? { ...line, quantity: Math.min(99, quantity) } : line);
    writeGuestLines(lines);
    await loadGuestCart();
  }, [isAuthenticated, loadGuestCart, refreshCart, removeItem]);

  const updateUnsyncedGuestItem = useCallback(async (productId, quantity) => {
    if (!isAuthenticated || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      throw new Error("Choose a valid quantity.");
    }
    const lines = readGuestLines();
    const previous = lines.find((line) => line.product_id === productId);
    if (!previous) return;
    const updated = quantity === 0
      ? lines.filter((line) => line.product_id !== productId)
      : lines.map((line) => line.product_id === productId ? { ...line, quantity } : line);
    writeGuestLines(updated);

    const key = mergeKey(userIdentity);
    try {
      const plan = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(plan?.lines)) {
        plan.lines = plan.lines.flatMap((line) => {
          if (line.product_id === productId) {
            if (quantity === 0) return [];
            const baseQuantity = Number.isInteger(line.baseQuantity)
              ? line.baseQuantity
              : Math.max(0, line.targetQuantity - line.guestQuantity);
            return [{ ...line, guestQuantity: quantity, baseQuantity, targetQuantity: Math.min(99, baseQuantity + quantity) }];
          }
          return updated.some((guest) => guest.product_id === line.product_id) ? [line] : [];
        });
        if (updated.length) localStorage.setItem(key, JSON.stringify(plan));
        else localStorage.removeItem(key);
      }
    } catch {
      writeGuestLines(lines);
      throw new Error("Your saved cart could not be updated. Please retry.");
    }
    setUnsyncedGuestItems(await resolveGuestLines(updated));
    setSyncError("");
  }, [isAuthenticated, resolveGuestLines, userIdentity]);

  return (
    <CartContext.Provider value={{ items, count, loading, syncError, mergeStatus, unsyncedGuestItems, refreshCart, retryMerge: mergeGuestCart, addItem, updateItem, removeItem, updateUnsyncedGuestItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) throw new Error("useCart must be used within a CartProvider");
  return context;
}
