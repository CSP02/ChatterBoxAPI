/**
 * ? Importing the packages/libraries
 */
require('dotenv').config();
const mongoose = require("mongoose")
const express = require("express")
const router = require("./routes/routes")
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
apiServer.use("/api", router)

// const http = require("http").Server(apiServer)
// const io = require("socket.io")(http)

// /**
//  * ? Socket io events
//  */
// io.on("connection", socket => {
//     console.log("A user connected to the app!")
// })

apiServer.listen("3000", () => {
    console.log("Listening to 3000")
})





/**
 * ? Imports
 */
// const io = require("socket.io")
const express = require('express');
const bcrypt = require("bcrypt")
const User = require("../Models/UserModel.js")
const Message = require("../Models/MessageModel.js")
const router = express.Router()

/**
 * ? bcrypt config
 */

const saltRounds = 10;

/**
 * ? API requests
 */
let userId = 1
//signup user with credentials
router.post('/signup', async (req, res) => {
    const username = req.body.username

    bcrypt.hash(req.body.password, saltRounds, async (err, hashedPassword) => {
        const password = hashedPassword
        const allUsers = await User.find()

        userId = allUsers[allUsers.length - 1].userID + 1

        const user = new User({
            username: username,
            password: password,
            userID: userId
        })

        try {
            allUsers.forEach(user => {
                if (user.username === username) return res.send({ success: false, message: "Username already exists" })
            })

            const userData = await user.save()
            res.send({ success: true, user: userData })
        } catch (error) {
            console.log(error)
        }
    });
})

//login the user with the credentials 
router.post('/login', async (req, res) => {
    try {
        const allUsers = await User.find()
        const username = req.body.username
        const password = req.body.password

        const user = allUsers.filter(ob => ob.username === username)[0]
        if (user) {
            bcrypt.compare(password, user.password, async (err, result) => {
                if (result) return res.send({ CorrectCredentials: true, user: user })
                return res.send({ CorrectCredentials: false, user: null })
            });
        } else {
            res.send({ content: "UserNotFound" })
        }
    } catch (error) {
        console.log(error)
    }
})

//Get all messages and send to the client
router.get('/messages', async (req, res) => {
    const allMessages = await Message.find()

    try {
        if (allMessages.length === 0) res.send({ EmptyChat: true, messages: allMessages })
        else res.send({ content: "Messages", messages: allMessages })
    } catch (error) {
        console.log(error)
    }
})

//post message to the database
router.post('/messages', async (req, res) => {
    const username = req.body.username
    const color = req.body.color
    const messageContent = req.body.content

    const message = new Message({
        username: username,
        color: color,
        content: messageContent,
        timestamp: Date.now()
    })

    try {
        const messageData = await message.save()
        res.send({ content: "Posted message!", data: messageData })
    } catch (error) {
        console.log(error)
    }
})

module.exports = router