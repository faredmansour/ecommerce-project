/**
 * seed.js - يُدخل الكاتيجوريات والمنتجات في MongoDB
 * تشغيل: node seed.js
 */

const dotenv = require("dotenv").config({ path: "./connection/config.env" });
const mongoose = require("mongoose");
const Categories = require("./models/categoryModel");
const Products = require("./models/productModel");

const categoriesData = [
  { name: "Computers",    description: "Laptops, Desktops, Monitors and Computing accessories" },
  { name: "Smartphones",  description: "Mobile phones, tablets and accessories" },
  { name: "Audio",        description: "Headphones, speakers and audio equipment" },
  { name: "Gaming",       description: "Consoles, controllers and gaming gear" },
  { name: "Cameras",      description: "Digital cameras, action cams and photography gear" },
  { name: "Accessories",  description: "Keyboards, mice, hubs and wearables" },
];

const productsData = [
  {
    name: "Gaming Laptop Pro 15",
    price: 1299.99,
    description: "High-performance gaming laptop with RTX 4060 GPU, 16GB RAM, 512GB SSD, and a stunning 15.6-inch 144Hz display.",
    image: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=600",
    stock: 25,
    categoryName: "Computers",
  },
  {
    name: "Ultra Slim Notebook",
    price: 899.99,
    description: "Lightweight and powerful ultrabook perfect for professionals. Features a 14-inch display, Intel i7 processor, and all-day battery life.",
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600",
    stock: 40,
    categoryName: "Computers",
  },
  {
    name: "Desktop Workstation X1",
    price: 1899.99,
    description: "Professional desktop workstation with Intel i9 processor, 32GB RAM, 1TB NVMe SSD, and dedicated graphics card.",
    image: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=600",
    stock: 15,
    categoryName: "Computers",
  },
  {
    name: "4K Monitor 27-inch",
    price: 449.99,
    description: "Professional 27-inch 4K IPS monitor with 99% sRGB color accuracy, USB-C connectivity, and adjustable stand.",
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600",
    stock: 30,
    categoryName: "Computers",
  },
  {
    name: "Smartphone X Pro",
    price: 999.99,
    description: "Flagship smartphone with a 6.7-inch AMOLED display, triple camera system, 5G connectivity, and 256GB storage.",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600",
    stock: 60,
    categoryName: "Smartphones",
  },
  {
    name: "Budget Phone SE",
    price: 349.99,
    description: "Affordable smartphone with great cameras, smooth performance, and long battery life. Perfect everyday phone.",
    image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600",
    stock: 80,
    categoryName: "Smartphones",
  },
  {
    name: "Wireless Noise-Cancelling Headphones",
    price: 249.99,
    description: "Premium wireless headphones with active noise cancellation, 30-hour battery life, and studio-quality sound.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600",
    stock: 50,
    categoryName: "Audio",
  },
  {
    name: "Portable Bluetooth Speaker",
    price: 79.99,
    description: "Compact waterproof Bluetooth speaker with 360-degree sound, 12-hour battery, and built-in microphone.",
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600",
    stock: 70,
    categoryName: "Audio",
  },
  {
    name: "Gaming Console Elite",
    price: 499.99,
    description: "Next-gen gaming console with 4K gaming, 1TB storage, ultra-fast SSD, and backward compatibility.",
    image: "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600",
    stock: 20,
    categoryName: "Gaming",
  },
  {
    name: "Wireless Gaming Controller",
    price: 59.99,
    description: "Ergonomic wireless gaming controller with haptic feedback, adaptive triggers, and 20-hour battery life.",
    image: "https://images.unsplash.com/photo-1592840496694-26d035b52b48?w=600",
    stock: 90,
    categoryName: "Gaming",
  },
  {
    name: "Mirrorless Camera Kit",
    price: 1499.99,
    description: "Professional mirrorless camera with 24.2MP sensor, 4K video recording, and interchangeable lens system.",
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600",
    stock: 12,
    categoryName: "Cameras",
  },
  {
    name: "Action Camera Waterproof",
    price: 299.99,
    description: "Rugged waterproof action camera with 5K recording, image stabilization, and voice control.",
    image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600",
    stock: 35,
    categoryName: "Cameras",
  },
  {
    name: "USB-C Hub Adapter",
    price: 39.99,
    description: "7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader, and 100W power delivery pass-through.",
    image: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=600",
    stock: 100,
    categoryName: "Accessories",
  },
  {
    name: "Mechanical Gaming Keyboard",
    price: 129.99,
    description: "RGB mechanical keyboard with Cherry MX switches, programmable keys, and aluminum frame.",
    image: "https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600",
    stock: 45,
    categoryName: "Accessories",
  },
  {
    name: "Wireless Ergonomic Mouse",
    price: 69.99,
    description: "Ergonomic wireless mouse with adjustable DPI, silent clicks, and multi-device connectivity.",
    image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=600",
    stock: 55,
    categoryName: "Accessories",
  },
  {
    name: "Smart Watch Series 5",
    price: 399.99,
    description: "Feature-rich smartwatch with health monitoring, GPS, water resistance, and 3-day battery life.",
    image: "https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=600",
    stock: 38,
    categoryName: "Accessories",
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    await Categories.deleteMany({});
    await Products.deleteMany({});
    console.log("🗑️  Cleared existing categories and products");

    // Insert categories
    const insertedCategories = await Categories.insertMany(categoriesData);
    console.log(`✅ Inserted ${insertedCategories.length} categories`);

    // Build a name→_id map
    const catMap = {};
    insertedCategories.forEach((c) => {
      catMap[c.name] = c._id;
    });

    // Attach correct category ObjectId to each product
    const productsWithCatId = productsData.map(({ categoryName, ...rest }) => ({
      ...rest,
      category: catMap[categoryName],
    }));

    const insertedProducts = await Products.insertMany(productsWithCatId);
    console.log(`✅ Inserted ${insertedProducts.length} products`);

    console.log("\n🎉 Database seeded successfully!");
    console.log("─────────────────────────────────");
    insertedCategories.forEach((c) => console.log(`  📁 ${c.name}  (${c._id})`));
    console.log("─────────────────────────────────");

  } catch (err) {
    console.error("❌ Seed error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

seed();
