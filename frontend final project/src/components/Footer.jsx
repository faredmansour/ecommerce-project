import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">ALFREDO</span>
            </div>
            <p className="text-sm text-gray-400">
              Your one-stop shop for everything you need. Quality products at great prices.
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link to="/home" className="text-sm hover:text-orange-400 transition-colors">Home</Link></li>
              <li><Link to="/category" className="text-sm hover:text-orange-400 transition-colors">All Products</Link></li>
              <li><Link to="/cart" className="text-sm hover:text-orange-400 transition-colors">Cart</Link></li>
              <li><Link to="/wishlist" className="text-sm hover:text-orange-400 transition-colors">Wishlist</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Account</h3>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm hover:text-orange-400 transition-colors">Login</Link></li>
              <li><Link to="/register" className="text-sm hover:text-orange-400 transition-colors">Register</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-2">
              <li className="text-sm">Phone: +1-202-555-0104</li>
              <li className="text-sm">Email: support@alfredo.com</li>
              <li className="text-sm">Address: 123 Commerce St, NY</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-sm text-gray-500">
          &copy; 2026 ALFREDO. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
