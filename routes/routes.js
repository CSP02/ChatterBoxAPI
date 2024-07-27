/**
 * ? Imports
 */
const { Types } = require("./types.js")
const { check, validationResult } = require('express-validator');
const mongoose = require("mongoose")
const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../Models/UserModel.js");
const Message = require("../Models/MessageModel.js");
const Channel = require("../Models/ChannelModel.js")
const router = express.Router();
const cheerio = require("cheerio")
const jwt = require("jsonwebtoken");
const isAuthorized = require("./middlewares/Authentication.js")

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
router.post("/signup", [
    check('username').trim().isLength({ min: 3, max: 32 }),
    check('password').isLength({ min: 6, max: 32 }),
    check('color').isHexColor()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const username = req.body.username.replaceAll(" ", "_").slice(0, 31);
    const color = req.body.color.toString();
    const avatarURL = req.body.avatarURL

    bcrypt.hash(req.body.password, saltRounds, async (err, hashedPassword) => {
        const password = hashedPassword;
        const userDb = await User.find({ username });

        const user = new User({
            username: username,
            password: password,
            color: color.slice(0, 6),
            avatarURL: avatarURL.slice(0, 64)
        });

        try {
            if (userDb.length > 0)
                return res.status(500).send({ error: types.ErrorTypes.USER_ALREADY_EXIST });

            const userData = await user.save();
            return res.send({ user: userData });
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
                        avatarURL: user.avatarURL,
                        status: 1
                    }
                    user.status = 1
                    user.save()
                    return res.send({ user: userFound, token: token, refreshToken: refreshToken });
                }
                return res.status(401).send({ error: types.ErrorTypes.INVALID_CREDENTIALS });
            });
        } else {
            return res.status(500).send({ error: types.ErrorTypes.USER_NOT_FOUND });
        }
    } catch (error) {
        console.log(error);
        res.send(error)
    }
});

router.get("/logout", isAuthorized, async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ");
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const uid = decoded.uid

    const user = await User.findOne({ _id: uid });
    user.status = 0
    user.save()

    return res.status(200).send({ success: types.SuccessTypes.SUCCESS })
})

const fetchWithTimeout = (url, options, timeout = 1000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
        )
    ]);
};

//post message to the database
router.post("/messages", isAuthorized, async (req, res) => {
    const authHeader = req.headers.authorization;
    const [scheme, token] = authHeader.split(" ");

    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const decodedUserID = decoded.uid;

        const userInDb = await User.findOne({ _id: decodedUserID });
        if (!userInDb) return res.status(404).send({ error: "User not found" });

        const channelId = req.query.channel_id;
        const channelInDb = await Channel.findOne({ _id: channelId });
        if (!channelInDb) return res.status(404).send({ error: "Channel not found" });

        if (!channelInDb.members.some(member => member.username === userInDb.username)) {
            return res.status(403).send({ message: "You don't have access to the channel!" });
        }

        if (!req.body.content || typeof req.body.content !== 'string' || req.body.content.trim() === "") {
            return res.status(400).send({ error: types.ErrorTypes.NULL_CONTENT });
        }

        const messageContent = req.body.content.slice(0, 500).trim();
        const repliedTo = req.body.repliedTo;

        const user = {
            _id: userInDb._id
        };

        const channel = {
            _id: channelInDb._id
        };

        let message;
        if (repliedTo) {
            const repliedToMessage = await Message.findOne({ _id: repliedTo._id });
            if (!repliedToMessage) console.log("unknown message")
            message = new Message({
                user,
                content: messageContent,
                timestamp: Date.now(),
                channel,
                repliedTo: repliedToMessage ? repliedToMessage._id : undefined
            });
        } else {
            message = new Message({
                user,
                content: messageContent,
                timestamp: Date.now(),
                channel
            });
        }

        const datas = messageContent.split(/\s/g).filter(messCon => messCon.startsWith("https://"));
        const components = [];

        if (datas.length > 0) {
            const urlFetchPromises = datas.map(async (data) => {
                try {
                    await fetchWithTimeout(data, { mode: "cors", method: "GET" });
                } catch (e) {
                    return;  // Skip invalid URLs
                }

                try {
                    const response = await fetchWithTimeout(data, { mode: "cors", method: "GET" });
                    if (!response.ok) return;
                    const contentType = response.headers.get("Content-Type")
                    if (contentType.includes("text/html")) {
                        const text = await response.text();
                        const $ = cheerio.load(text);
                        const embed = {
                            type: types.ComponentTypes.EMBED,
                            title: $('meta[property="og:title"]').attr("content"),
                            description: $("meta[property='og:description']").attr("content"),
                            image: $("meta[property='og:image']").attr("content"),
                            url: data
                        };
                        components.push(embed);
                    } else if (contentType.includes("image")) {
                        const embed = {
                            type: types.ComponentTypes.IMAGE,
                            imageURL: data
                        };
                        components.push(embed);
                    }

                    message.components = components;
                } catch (e) {
                    console.error("Error fetching URL:", e);
                }
            });

            await Promise.all(urlFetchPromises);
        }

        await message.save();
        return res.sendStatus(200);

    } catch (e) {
        if (e.name === 'TokenExpiredError') {
            return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE });
        } else {
            console.error(e);
            return res.status(500).send({ error: "Internal Server Error" });
        }
    }
});

router.get("/get_users", isAuthorized, async (req, res) => {
    if (!req.query) return res.send({ error: types.ErrorTypes.INVALID_REQUEST })
    const cid = req.query.cid

    const channel = await Channel.findById(cid)
    const members = channel.members
    const mem2push = []
    for (let i = 0; i < members.length; i++) {
        const member = await User.findById(members[i]._id)
        const mem = {
            username: member.username,
            avatarURL: member.avatarURL,
            status: member.status,
            color: member.color
        }
        mem2push.push(mem)
    }

    return res.status(200).send({ members: mem2push })
})

router.get("/messages", isAuthorized, async (req, res) => {
    if (!req.query) return res.send({ error: types.ErrorTypes.INVALID_REQUEST })
    const [scheme, token] = req.headers.authorization.split(" ")

    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const userId = decoded.uid
        const channelId = req.query.channel_id
        const chunkSize = req.query.chunk
        const channel = await Channel.findOne({ _id: channelId })

        const userInDb = await User.findOne({ _id: userId })
        const user = {
            username: userInDb.username,
            color: userInDb.color,
            avatarURL: userInDb.avatarURL
        }

        if (channel.members.filter(ob => ob.username === user.username).length <= 0) return res.status(401).send({ message: "Author didnt added you to the channel yet! Ask them to add you!", error: types.ErrorTypes.USER_NOT_FOUND })
        const allMessagesIndb = await Message.find({});
        const allMessagesFiltered = allMessagesIndb.filter(ob => JSON.stringify(ob.channel._id) === JSON.stringify(channel._id))

        const processMessages = async () => {
            const messagePromises = allMessagesFiltered.map(async (message, index) => {
                const _id = message.user._id
                const messageAuthor = await User.findOne({ _id })

                const userP = {
                    username: messageAuthor.username,
                    avatarURL: messageAuthor.avatarURL,
                    color: messageAuthor.color
                }
                const messageToPush = {
                    _id: message._id,
                    user: userP,
                    content: message.content,
                    components: message.components,
                    timestamp: message.timestamp
                };
                if (message.repliedTo) {
                    const replied_id = message.repliedTo
                    const replyMsg = await Message.findOne({ _id: replied_id });
                    const authorId = replyMsg.user._id
                    const userDb = await User.findOne({ _id: authorId })

                    messageToPush.repliedTo = {
                        _id: replied_id,
                        username: userDb.username,
                        color: userDb.color,
                        avatarURL: userDb.avatarURL,
                        content: replyMsg.content.slice(0, 32) + "..."
                    };
                }
                return messageToPush;
            });

            try {
                const allMessages = await Promise.all(messagePromises);
                const messagesToPush = allMessages.slice(allMessages.length - chunkSize, allMessages.length);
                if (allMessages.length <= 15) {
                    return res.send({ messages: allMessages });
                } else {
                    return res.send({ messages: messagesToPush });
                }
            } catch (error) {
                console.log(error);
                return res.status(500).send({ error: 'Internal Server Error' });
            }
        };
        processMessages();
    } catch (e) {
        console.log(e)
        if (e.name === 'TokenExpiredError') return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
    }
})

router.put("/profile", isAuthorized, async (req, res) => {
    const updateUsername = req.body.username;
    const color = req.body.color;
    const avatarURL = req.body.avatarURL;
    const [scheme, token] = req.headers.authorization.split(" ")

    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const userId = decoded.uid;

        const user = {
            username: updateUsername.slice(0, 32),
            color: color.slice(0, 7),
            avatarURL: avatarURL.slice(0, 64),
        };
        const prevUser = await User.findOne({ _id: userId })
        const isUsernameAvailable = await User.find({ username: updateUsername.slice(0, 31) });

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
        const user2send = {
            _id: updatedUser._id,
            username: updatedUser.username,
            avatarURL: updatedUser.avatarURL,
            color: updatedUser.color
        }
        
        return res.send({
            content: "User updated successfully",
            success: true,
            updatedUser: user2send,
        })
    } catch (e) {
        if (e.name === 'TokenExpiredError') return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
    }
});

router.get("/request_new_token", isAuthorized, async (req, res) => {
    const [scheme, refreshToken] = req.headers.authorization.split(" ")

    const decoded = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64').toString());

    const user = await User.findOne({ _id: decoded.uid })
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
router.get("/channels", isAuthorized, async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const userId = decoded.uid
        const user = await User.findOne({ _id: userId })
        const userChannels = user.channels

        const channelsData = []

        userChannels.forEach(channel => {
            channelsData.push({
                iconURL: channel.iconURL,
                name: channel.name,
                _id: channel._id
            })
        })

        return res.status(200).send({ channels: channelsData })
    } catch (e) {
        if (e.name === 'TokenExpiredError') return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        console.log(e)
    }
})

router.post("/channels", isAuthorized, async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const userId = decoded.uid
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

        const user = await User.findOne({ _id: userId })

        if (user.channels.length >= 10) return res.send({ error: "You can only have 10 channels" });
        await channel.save()
        await User.findOneAndUpdate({ _id: userId },
            {
                $push: {
                    channels: channel
                },
            })
        return res.send({ channel: channel })
    } catch (e) {
        if (e.name === 'TokenExpiredError') return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        console.log(e)
    }
})

router.get("/search_user", isAuthorized, async (req, res) => {
    const username = req.query.username
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const user = await User.findOne({ username })

        if (user) return res.send({ username: user.username, avatarURL: user.avatarURL })
        res.status(404).send({ error: types.ErrorTypes.USER_NOT_FOUND })
    } catch (e) {
        if (e.name === 'TokenExpiredError') return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        console.log(e)
    }
})

router.get("/add_user", isAuthorized, async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const userId = decoded.uid

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
        console.log(membersInChannel.filter(member => member._id.toString() === user._id.toString()))
        if (JSON.stringify(channel.author._id) !== JSON.stringify(userId)) return res.status(401).send({ error: types.ErrorTypes.PERMISSIONS })
        if (membersInChannel.filter(member => member._id.toString() === user._id.toString()).length > 0) return res.send({ error: types.ErrorTypes.USER_ALREADY_EXIST })

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
        return res.send({ invited: userToPush })
    } catch (err) {
        if (err.message === "jwt expired") return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        console.log(err)
    }
})

router.get("/typing", isAuthorized, async (req, res) => {
    const [scheme, token] = req.headers.authorization.split(" ")
    try {
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const userId = decoded.uid

        const channelId = req.query.channel_id
        await Channel.findOne({ _id: channelId }).then(channel => {
            const membersInChannel = channel.members
            membersInChannel.forEach(member => {
                // console.log(member._id.toString(), userId.toString(), member._id.toString() === userId.toString())
                if (member._id.toString() === userId.toString()) return res.send({ success: true })
            })
        })
    } catch (err) {
        if (err.message === "jwt expired") return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        console.log(err)
    }
})
module.exports = router;