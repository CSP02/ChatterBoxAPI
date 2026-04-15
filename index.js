/**
 * ? Importing the packages/libraries
 */
require('dotenv').config();
const mongoose = require("mongoose")
const express = require("express")
const router = require("./routes/routes")
const cors = require("cors")
const morgan = require('morgan');
const logger = require('./config/logger');

const mongoPath = process.env.MONGOPATH

/**
 * ? Initializing mongoose connection
 */
mongoose.connect(mongoPath)
const database = mongoose.connection

/**
 * ? Handling database events
 */
database.on("error", error => {
    logger.error(error);
})

database.once("connected", () => {
    logger.info("Database connected!");
})

/**
 * ? Initialising express and configuring port
 */
const apiServer = express();
apiServer.use(express.json());

const corsOptions = {
  origin: 'https://chatter-box-indol.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
};

apiServer.use(cors(corsOptions));

apiServer.use("/api", router)
// apiServer.use(morgan('combined', {
//     stream: {
//         write: (message) => logger.info(message.trim())
//     }
// }));

apiServer.listen("3001", () => {
    logger.info("Listening to 3001")
})