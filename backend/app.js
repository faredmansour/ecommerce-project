
const dotenv = require("dotenv").config({ path: "./connection/config.env" });
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cors = require("cors");
const logger = require("./utils/logger");
const errorHandler = require("./middlewares/errorHandler");
const app = express();
const port = process.env.PORT || 8000;
const mongoose = require("mongoose");
const productRouter = require("./routers/productRouter");
const categoryRouter = require("./routers/categoryRouter");
const authRouter = require("./routers/authRouter");
const cartRouter = require("./routers/cartRouter");
const wishlistRouter = require("./routers/wishlistRouter");
const ordersRouter = require("./routers/ordersRouter");
const addressRouter = require("./routers/addressRouter");
const couponRouter = require("./routers/couponRouter");
const paymentRouter = require("./routers/paymentRouter");
const uploadRouter = require("./routers/uploadRouter");
app.use(helmet());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10kb" }));
app.use(mongoSanitize());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many login attempts. Try again later." },
});

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
async function dbconnection (){
 try{
 await mongoose.connect(process.env.DB_URL)
 logger.info("db connection success")
 }
 catch(err){
    logger.error(err.message);
    process.exit(1);
 }
}
dbconnection ()

app.use("/uploadimage", express.static("uploadimage"));
app.use("/api", uploadRouter);

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/coupons", couponRouter);
app.use("/api/payments", paymentRouter);


app.use(errorHandler);

app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});