const Products = require("../models/productModel");
const Order = require("../models/orderModel");
const User = require("../models/usermodel");
const Category = require("../models/categoryModel");

const getDashboardSummary = async (req, res) => {
  try {
    const [productsCount, categoriesCount, usersCount, orders, topProducts] = await Promise.all([
      Products.countDocuments(),
      Category.countDocuments(),
      User.countDocuments({ role: "user" }),
      Order.find({}).populate("user", "name email").sort({ createdAt: -1 }).lean(),
      Order.aggregate([
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product_id",
            name: { $first: "$items.name" },
            image: { $first: "$items.image" },
            category: { $first: "$items.category" },
            quantitySold: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          },
        },
        { $sort: { quantitySold: -1, revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const revenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const itemsSold = orders.reduce(
      (sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0
    );

    res.status(200).json({
      status: "success",
      data: {
        totals: {
          products: productsCount,
          categories: categoriesCount,
          users: usersCount,
          orders: orders.length,
          revenue,
          itemsSold,
        },
        recentOrders: orders.slice(0, 5),
        topProducts,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { getDashboardSummary };
