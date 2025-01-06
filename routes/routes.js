/**
 * ? Imports
 */
const express = require("express");
const router = express.Router();
const fs = require("fs");
const rateLimit = require('express-rate-limit');
const sanitizer = require('express-sanitizer');
const logger = require('../config/logger');

const routes = fs.readdirSync("./routes/routes").filter(file => file.endsWith("js"));

routes.forEach(route => {
    require(`./routes/${route}`)(router);
})

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