const Products = require("../models/productModel");
const Order = require("../models/orderModel");
const User = require("../models/usermodel");
const Category = require("../models/categoryModel");

const buildDateRange = (period) => {
  const now = new Date();

  switch (period) {
    case "day":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
        end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
      };
    case "month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    case "year":
      return {
        start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      };
    default:
      return {
        start: new Date(0),
        end: new Date(),
      };
  }
};

const getDashboardSummary = async (req, res) => {
  try {
    const [productsCount, categoriesCount, usersCount, orders, topProducts, lowStockProducts] = await Promise.all([
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
      Products.find({ stock: { $lte: 5 } }).sort({ stock: 1 }).limit(5).lean(),
    ]);

    const revenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const itemsSold = orders.reduce(
      (sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0
    );
    const pendingOrders = orders.filter((order) => order.status === "pending").length;

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
          pendingOrders,
          lowStockCount: lowStockProducts.length,
        },
        recentOrders: orders.slice(0, 5),
        topProducts,
        lowStockProducts,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const dayRange = buildDateRange("day");
    const monthRange = buildDateRange("month");
    const yearRange = buildDateRange("year");

    const [dailySales, monthlySales, yearlySales, topProducts, statusBreakdown] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: dayRange.start, $lte: dayRange.end } } },
        { $group: { _id: { $dateToString: { format: "%H", date: "$createdAt" } }, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: monthRange.start, $lte: monthRange.end } } },
        { $group: { _id: { $dateToString: { format: "%d", date: "$createdAt" } }, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: yearRange.start, $lte: yearRange.end } } },
        { $group: { _id: { $dateToString: { format: "%m", date: "$createdAt" } }, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product_id",
            name: { $first: "$items.name" },
            quantitySold: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          },
        },
        { $sort: { quantitySold: -1, revenue: -1 } },
        { $limit: 10 },
      ]),
      Order.aggregate([
        { $group: { _id: "$status", orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { orders: -1 } },
      ]),
    ]);

    const overview = {
      todayRevenue: dailySales.reduce((sum, item) => sum + (item.revenue || 0), 0),
      monthlyRevenue: monthlySales.reduce((sum, item) => sum + (item.revenue || 0), 0),
      yearlyRevenue: yearlySales.reduce((sum, item) => sum + (item.revenue || 0), 0),
      todayOrders: dailySales.reduce((sum, item) => sum + (item.orders || 0), 0),
      monthlyOrders: monthlySales.reduce((sum, item) => sum + (item.orders || 0), 0),
      yearlyOrders: yearlySales.reduce((sum, item) => sum + (item.orders || 0), 0),
    };

    res.status(200).json({
      status: "success",
      data: {
        overview,
        topProducts,
        statusBreakdown,
        reports: {
          daily: dailySales,
          monthly: monthlySales,
          yearly: yearlySales,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { getDashboardSummary, getAnalytics };
