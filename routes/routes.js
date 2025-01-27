/**
 * ? Imports
 */
const express = require("express");
const router = express.Router();
const rateLimit = require('express-rate-limit');
const sanitizer = require('express-sanitizer');
const logger = require('../config/logger');

require("./routes/channel")(router);
require("./routes/login")(router);
require("./routes/logout")(router);
require("./routes/message")(router);
require("./routes/profile")(router);
require("./routes/token")(router);
require("./routes/typing")(router);
require("./routes/user")(router);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
});
const errorHandler = (err, req, res, next) => {
    logger.error(err);
    res.status(500).send({ error: 'Something went wrong' });
};

const winstonMiddleware = (req, res, next) => {
    logger.info(`Request: ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
    next();
};

router.use(sanitizer());
router.use(limiter);
router.use(errorHandler);
router.use(winstonMiddleware);

module.exports = router;