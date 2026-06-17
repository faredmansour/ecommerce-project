import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { cartAPI } from "../services/api";

const CartContext = createContext(undefined);

export function CartProvider({ children }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const { isAuthenticated, loading } = useAuth();

  const clearCart = useCallback(() => {
    setItems([]);
    setCount(0);
  }, []);

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      clearCart();
      return;
    }

    try {
      const res = await cartAPI.getAll();
      const data = res.data.data || [];
      setItems(data);
      setCount(data.reduce((sum, item) => sum + (item.quantity || 0), 0));
    } catch (err) {
      clearCart();
    }
  }, [clearCart, isAuthenticated]);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      clearCart();
      return;
    }

    refreshCart();
    const unsubscribe = cartAPI.subscribe(refreshCart);
    return () => unsubscribe();
  }, [clearCart, isAuthenticated, loading, refreshCart]);

  return (
    <CartContext.Provider value={{ items, count, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
