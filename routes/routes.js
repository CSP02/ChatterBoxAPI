/**
 * ? Imports
 */
const { Types } = require("./types.js")
const mongoose = require("mongoose")
const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../Models/UserModel.js");
const Message = require("../Models/MessageModel.js");
const Channel = require("../Models/ChannelModel.js")
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
            return res.send({ success: true, user: userData });
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
        const user = await User.findOne({ username });
        const secret = process.env.JWT_SECRET;

        if (user) {
            bcrypt.compare(password, user.password, async (err, result) => {
                const token = jwt.sign(
                    { uid: user._id },
                    secret,
                    { expiresIn: "10m" }
                );

                const refreshToken = jwt.sign(
                    { uid: user._id },
                    secret,
                    { expiresIn: "10h" }
                );

                if (result) {
                    const userFound = {
                        username: user.username,
                        color: user.color,
                        avatarURL: user.avatarURL
                    }
                    res.send({ CorrectCredentials: true, user: userFound, token: token, refreshToken: refreshToken });
                    return;
                }
                return res.send({ CorrectCredentials: false, user: null });
            });
        } else {
            return res.send({ content: "UserNotFound" });
        }
    } catch (error) {
        console.log(error);
    }
});

//post message to the database
router.post("/messages", async (req, res) => {
    if (!req.query) return res.send("error")

    const [scheme, token] = req.headers["authorization"].split(" ")
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { complete: true })
        const decodedUserID = decoded.payload.uid;

        const userInDb = await User.findOne({ _id: decodedUserID });
        const channelId = req.query.channel_id
        const color = userInDb.color;
        const avatarURL = userInDb.avatarURL;
        const username = userInDb.username
        const user = {
            username: username,
            color: color,
            avatarURL: avatarURL,
        };

        const channelInDb = await Channel.findOne({ _id: channelId })
        if (channelInDb.members.filter(ob => ob.username === user.username).length <= 0) return res.send({ message: "You dont have access to the channel!" })

        const channel = {
            _id: channelInDb._id,
            name: channelInDb.name,
            iconURL: channelInDb.iconURL,
            author: channelInDb.author
        }

        const messageContent = req.body.content.slice(0, 500);
        const repliedTo = req.body.repliedTo

        const components = []
        const timeStamp = Date.now()
        let message
        if (repliedTo) {
            const repliedToUser = await User.findOne({ username: repliedTo.username })
            message = new Message({
                user: user,
                content: messageContent,
                timestamp: timeStamp,
                channel: channel,
                repliedTo: {
                    username: repliedToUser.username,
                    color: repliedToUser.color,
                    avatarURL: repliedToUser.avatarURL,
                    content: repliedTo.content
                }
            });
        } else {
            message = new Message({
                user: user,
                content: messageContent,
                timestamp: timeStamp,
                channel: channel
            });
        }

        const datas = messageContent.split(" ").filter(messCon => messCon.startsWith("https://"));
        if (datas.length <= 0) {
            const messageData = await message.save()
            return res.send({ content: "Posted message!", data: { user: user, content: messageContent, timestamp: timeStamp } });
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
                            image: $("meta[property='og:image']").attr("content"),
                            url: data
                        }
                        components.push(embed)
                        message.components = components

                        if (index === [...datas].length - 1) {
                            const messageData = await message.save()
                            return res.send({ content: "Posted message!", data: message });
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
                        const messageData = await message.save()
                        return res.send({ content: "Posted message!", data: message });
                    }
                }
            })
        })

    } catch (e) {
        if (e.message === "jwt expired")
            return res.sendStatus(401)

        console.log(e)
    }
});

router.get("/messages", async (req, res) => {
    console.time("send")
    if (!req.query) return res.send("Error")
    const [scheme, token] = req.headers["authorization"].split(" ")

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            complete: true,
        })

        const userId = decoded.payload.uid
        const channelId = req.query.channel_id
        const chunkSize = req.query.chunk
        const channel = await Channel.findOne({ _id: channelId })

        const userInDb = await User.findOne({ _id: userId })
        const user = {
            username: userInDb.username,
            color: userInDb.color,
            avatarURL: userInDb.avatarURL
        }

        if (channel.members.filter(ob => ob.username === user.username).length <= 0) return res.send({ message: "Author didnt added you to the channel yet ask them to add you!" })

        const allMessagesIndb = await Message.find({});

        const allMessagesFiltered = allMessagesIndb.filter(ob => JSON.stringify(ob.channel._id) === JSON.stringify(channel._id))
        const allMessages = []

        allMessagesFiltered.forEach(async message => {
            const messageToPush = {
                user: message.user,
                content: message.content,
                components: message.components,
                timestamp: message.timestamp,
                repliedTo: message.repliedTo
            }

            allMessages.push(messageToPush)
        })
        const messagesToPush = allMessages.slice(allMessages.length - chunkSize, allMessages.length)
        console.timeEnd("send")
        try {
            if (allMessages.length <= 15)
                return res.send({ messages: allMessages });
            else return res.send({ messages: messagesToPush });
            // else return res.send({ messages: messagesToPush });
        } catch (error) {
            console.log(error);
        }
    } catch (e) {
        if (e.message === "jwt expired") {
            res.sendStatus(401)
            return
        }
    }
})

router.put("/profile", async (req, res) => {
    const updateUsername = req.body.username;
    const color = req.body.color;
    const avatarURL = req.body.avatarURL;
    const [scheme, token] = req.headers["authorization"].split(" ")

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            complete: true,
        });

        const userId = decoded.payload.uid;

        const user = {
            username: updateUsername,
            color: color,
            avatarURL: avatarURL,
        };
        const prevUser = await User.findOne({ _id: userId })
        const isUsernameAvailable = await User.find({ username: updateUsername });

        if (isUsernameAvailable.length > 0 && updateUsername !== prevUser.username) return res.send({ content: "Username already exists", success: false })

        await User.findOneAndUpdate({ _id: userId }, user);
        const messages = await Message.find();
        const userMessages = messages.filter(
            (userOb) => userOb.user.username === prevUser.username,
        );
        userMessages.forEach(async (userMessage) => {
            await Message.findOneAndUpdate(userMessage, {
                $set: {
                    user: user,
                },
            });
        });
        const updatedUser = await User.findOne({ _id: userId })
        return res.send({
            content: "User updated successfully",
            success: true,
            updatedUser: updatedUser,
        })
    } catch (e) {
        if (e.message === "jwt expired") {
            return res.sendStatus(401)
        }
    }
});

router.get("/request_new_token", async (req, res) => {
    const [scheme, refreshToken] = req.headers["authorization"].split(" ")

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET, { complete: true })
    const user = await User.findOne({ _id: decoded.payload.uid })
    const newToken = jwt.sign(
        { uid: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );

    const newRefreshToken = jwt.sign(
        { uid: user._id },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
    );

    return res.send({ token: newToken, refreshToken: newRefreshToken })
})

/**
 * ? Future update
 */
router.get("/channels", async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { complete: true })
        const userId = decoded.payload.uid
        const user = await User.findOne({ _id: userId })
        const userChannels = user.channels

        const channelsData = []

        user.channels.forEach(channel => {
            channelsData.push({
                iconURL: channel.iconURL,
                name: channel.name,
                _id: channel._id
            })
        })

        return res.send({ channels: channelsData })
    } catch (e) {
        if (e.message === "jwt expired") return res.sendStatus(401)
        console.log(e)
    }
})

router.post("/channels", async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { complete: true })
        const userId = decoded.payload.uid
        const authorInDb = await User.findOne({ _id: userId })

        const author = {
            _id: authorInDb._id,
            username: authorInDb.username,
            avatarURL: authorInDb.avatarURL,
            color: authorInDb.color
        }

        const groupMembers = []
        groupMembers.push(author)

        const channelName = req.body.channelName
        const iconURL = req.body.iconURL ? iconURL : ""

        const channel = new Channel({
            name: channelName,
            iconURL: iconURL,
            author: author,
            members: groupMembers
        })

        await channel.save()
        await User.findOneAndUpdate({ _id: userId },
            {
                $push: {
                    channels: channel
                },
            })
        return res.send({ channel: channel })
    } catch (e) {
        if (e.message === "jwt expired") return res.sendStatus(401)
        console.log(e)
    }
})

router.get("/add_user", async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { complete: true })
        const userId = decoded.payload.uid

        const username = req.query.username
        const channelId = req.query.channel_id

        const user = await User.findOne({ username: username })
        const channel = await Channel.findOne({ _id: channelId })


        const membersInChannel = channel.members

        const userToPush = {
            _id: user._id,
            username: user.username,
            avatarURL: user.avatarURL,
            color: user.color
        }

        if (JSON.stringify(channel.author._id) !== JSON.stringify(userId)) return res.send({ message: "You are not the author of this channel!" })
        if (membersInChannel.filter(member => member._id === JSON.stringify(user._id)).length > 0) return res.send({ message: "User already exist in the channel!" })

        const channelToPush = {
            _id: channel._id,
            name: channel.name,
            iconURL: channel.iconURL,
            author: channel.author
        }

        membersInChannel.push(userToPush)

        const updatedChannel = await Channel.findOneAndUpdate({ _id: channelId }, {
            $set: {
                members: membersInChannel
            }
        })

        const updatedUser = await User.findOneAndUpdate({ username: username }, {
            $push: {
                channels: channelToPush
            }
        })
        return res.send({ success: true, invited: userToPush })
    } catch (err) {
        if (err.message === "jwt expired") return res.sendStatus(401)
        console.log(err)
    }
})
module.exports = router;