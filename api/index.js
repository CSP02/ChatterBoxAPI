/**
 * ? Importing the packages/libraries
 */
require('dotenv').config();
const mongoose = require("mongoose")
const express = require("express")
const router = require("../routes/routes")
const cors = require("cors")
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
    console.log(error)
})

database.once("connected", () => {
    console.log("Database connected!")
})

/**
 * ? Initialising express and configuring port
 */
const apiServer = express();
apiServer.use(express.json())
apiServer.use(cors())
apiServer.use("/", router)

apiServer.listen("3001", () => {
    console.log("Listening to 3001")
})