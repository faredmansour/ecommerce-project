import { createContext, useContext, useEffect, useState } from "react";
import { cartAPI } from "../services/api";

const CartContext = createContext(undefined);

export function CartProvider({ children }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);

  const refreshCart = async () => {
    try {
      const res = await cartAPI.getAll();
      const data = res.data.data || [];
      setItems(data);
      setCount(data.reduce((sum, item) => sum + (item.quantity || 0), 0));
    } catch (err) {
      setItems([]);
      setCount(0);
    }
  };

  useEffect(() => {
    refreshCart();
    const unsubscribe = cartAPI.subscribe(refreshCart);
    return () => unsubscribe();
  }, []);

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
