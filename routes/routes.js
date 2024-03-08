/**
 * ? Imports
 */
const { Types } = require("./types.js")
const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../Models/UserModel.js");
const Message = require("../Models/MessageModel.js");
const router = express.Router();
const cheerio = require("cheerio")
const jwt = require("jsonwebtoken");

/**
 * ? Other constants
 */

const types = new Types()

/**
 * ? bcrypt config
 */

const saltRounds = 10;

/**
 * ? API requests
 */
//signup user with credentials
router.post("/signup", async (req, res) => {
    const username = req.body.username;
    const color = req.body.color.toString();
    const avatarURL = req.body.avatarURL

    bcrypt.hash(req.body.password, saltRounds, async (err, hashedPassword) => {
        const password = hashedPassword;
        const userDb = await User.find({ username });

        const user = new User({
            username: username,
            password: password,
            color: color,
            avatarURL: avatarURL
        });

        try {
            if (userDb.length > 0)
                return res.send({ success: false, message: "Username already exists" });

            const userData = await user.save();
            res.send({ success: true, user: userData });
        } catch (error) {
            console.log(error);
        }
    });
});

//login the user with the credentials
router.post("/login", async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        const user = await User.find({ username });
        const secret = process.env.JWT_SECRET;

        const token = jwt.sign(
            JSON.stringify({ username: username, password: password }),
            secret,
        );
        if (user.length > 0) {
            bcrypt.compare(password, user[0].password, async (err, result) => {
                if (result) {
                    res.send({ CorrectCredentials: true, user: user[0], token: token });
                    return;
                }
                return res.send({ CorrectCredentials: false, user: null });
            });
        } else {
            res.send({ content: "UserNotFound" });
        }
    } catch (error) {
        console.log(error);
    }
});

//post message to the database
router.post("/send_message", async (req, res) => {
    const [scheme, token] = req.headers["authorization"].split(" ")
    try {
        if (!isAuthorized(token)) return res.sendStatus(401)

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            complete: true,
        });
        const decodedUsername = decoded.payload.username;

        const userInDb = await User.findOne({ username: decodedUsername });

        const color = userInDb.color;
        const avatarURL = userInDb.avatarURL;
        const user = {
            username: decodedUsername,
            color: color,
            avatarURL: avatarURL,
        };
        const messageContent = req.body.content;

        const components = []
        const message = new Message({
            user: user,
            content: messageContent,
            timestamp: Date.now(),
        });

        const datas = messageContent.split(" ").filter(messCon => messCon.startsWith("https://"));
        if (datas.length <= 0) {
            const messageData = await message.save();
            return res.send({ content: "Posted message!", data: messageData });
        }

        [...datas].forEach(async (data, index) => {
            fetch(data, { mode: "cors", method: "GET" }).then(async response => {
                if (response.ok) return await response.blob()
            }).then(async response => {
                if (response.type.includes("text/html")) {
                    fetch(data, { mode: "cors", method: "GET" }).then(async response => {
                        if (response.ok) return await response.text()
                    }).then(async response => {
                        const $ = cheerio.load(response)
                        const embed = {
                            type: types.ComponentTypes.EMBED,
                            title: $('meta[property="og:title"]').attr("content"),
                            description: $("meta[property='og:description']").attr("content"),
                            image: $("meta[property='og:image']").attr("content")
                        }
                        components.push(embed)
                        message.components = components

                        if (index === [...datas].length - 1) {
                            const messageData = await message.save();
                            return res.send({ content: "Posted message!", data: messageData });
                        }
                    })
                }
                else if (response.type.includes("image")) {
                    const embed = {
                        type: types.ComponentTypes.IMAGE,
                        imageURL: data
                    }
                    components.push(embed)
                    message.components = components

                    if (index === [...datas].length - 1) {
                        const messageData = await message.save();
                        return res.send({ content: "Posted message!", data: messageData });
                    }
                }
            })
        })

    } catch (error) {
        console.log(error);
    }
});

router.get("/get_messages", async (req, res) => {
    const [scheme, token] = req.headers["authorization"].split(" ")

    if (!isAuthorized(token)) return res.sendStatus(401)
    const allMessages = await Message.find();
    try {
        if (allMessages.length === 0)
            res.send({ EmptyChat: true, messages: allMessages, authenticated: true });
        else res.send({ content: "Messages", messages: allMessages, authenticated: true });
    } catch (error) {
        console.log(error);
    }
})

router.put("/profile", async (req, res) => {
    const updateUsername = req.body.username;
    const color = req.body.color;
    const avatarURL = req.body.avatarURL;
    const [scheme, token] = req.headers["authorization"].split(" ")
    if (!isAuthorized(token)) return res.sendStatus(401)

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        complete: true,
    });

    const actualUsername = decoded.payload.username;

    const user = {
        username: updateUsername,
        color: color,
        avatarURL: avatarURL,
    };

    await User.findOneAndUpdate({ username: actualUsername }, user);
    const messages = await Message.find();
    const userMessages = messages.filter(
        (userOb) => userOb.user.username === actualUsername,
    );
    userMessages.forEach(async (userMessage) => {
        await Message.findOneAndUpdate(userMessage, {
            $set: {
                user: user,
            },
        });
    });
    const updatedUser = await User.findOne({ username: updateUsername });
    const userInDb = await User.findOne({ username: actualUsername });

    if (updatedUser !== userInDb)
        return res.send({
            content: "User updated successfully",
            success: true,
            updatedUser: updatedUser,
        });
    res.send({
        content: "failed to update user",
        success: false,
        reason: "unknown",
    });
});

async function isAuthorized(token) {
    try {
        if (!token || token === null)
            return false
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            complete: true,
        });
        const actualUsername = decoded.payload.username;
        const actualPassword = decoded.payload.password;

        const userInDb = await User.findOne({ username: actualUsername });
        if (!userInDb) return false

        bcrypt.compare(actualPassword, userInDb.password, async (err, result) => {
            if (result) return true
            return false
        });
    } catch (e) {
        if (e) {
            return false
        }
    }
}

module.exports = router;