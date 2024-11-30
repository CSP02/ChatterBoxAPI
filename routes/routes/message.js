const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Message = require("../../Models/MessageModel.js");
const Channel = require("../../Models/ChannelModel.js");
const cheerio = require("cheerio");
const isAuthorized = require("../middlewares/Authentication.js");

const types = new Types();

const fetchWithTimeout = (url, options, timeout = 1000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
        )
    ]);
};

//post message to the database
module.exports = (router) => {
    router.post("/messages", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const decodedUserID = decoded.uid;

            const userInDb = await User.findOne({ _id: decodedUserID });
            if (!userInDb) return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });

            const channelId = req.query.channel_id;
            const channelInDb = await Channel.findOne({ _id: channelId });
            if (!channelInDb) return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });

            if (!channelInDb.members.some(member => member.username === userInDb.username)) {
                return res.status(403).send({ message: "You don't have permissions to access this channel!", error: types.ErrorTypes.PERMISSIONS });
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
                        const contentType = response.headers.get("Content-Type");
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
                            if (contentType.includes("gif")) {
                                const embed = {
                                    type: types.ComponentTypes.GIF,
                                    imageURL: data
                                };
                                components.push(embed);
                            } else {
                                const embed = {
                                    type: types.ComponentTypes.IMAGE,
                                    imageURL: data
                                };
                                components.push(embed);
                            }
                        }
                        message.components = components;
                    } catch (e) {
                        console.error("Error fetching URL:", e);
                    }
                });

                await Promise.all(urlFetchPromises);
            }

            await message.save();
            return res.status(200).send({ messageId: message._id });

        } catch (e) {
            console.error(e);
        }
    });

    router.get("/messages", isAuthorized, async (req, res) => {
        if (!req.query) return res.send({ error: types.ErrorTypes.INVALID_REQUEST });

        try {
            const decoded = req.decoded;

            const userId = decoded.uid;
            const channelId = req.query.channel_id;
            const chunkSize = req.query.chunk;
            const channel = await Channel.findOne({ _id: channelId });

            let maxMessages = false;

            const userInDb = await User.findOne({ _id: userId });
            const user = {
                username: userInDb.username,
                color: userInDb.color,
                avatarURL: userInDb.avatarURL
            };

            if (channel.members.filter(ob => ob.username === user.username).length <= 0) return res.status(401).send({ message: "Author didnt added you to the channel yet! Ask them to add you!", error: types.ErrorTypes.NOT_FOUND });
            const allMessagesIndb = await Message.find({});
            const allMessagesFiltered = allMessagesIndb.filter(ob => channel._id.toString() === ob.channel._id.toString());
            if (chunkSize >= allMessagesFiltered.length) maxMessages = true;
            const processMessages = async () => {
                const messagePromises = allMessagesFiltered.map(async (message, index) => {
                    const _id = message.user._id;
                    const messageAuthor = await User.findOne({ _id });

                    const userP = {
                        username: messageAuthor.username,
                        avatarURL: messageAuthor.avatarURL,
                        color: messageAuthor.color
                    };
                    const messageToPush = {
                        _id: message._id,
                        user: userP,
                        content: message.content,
                        components: message.components,
                        timestamp: message.timestamp,
                        edited: message.edited
                    };
                    if (message.repliedTo) {
                        const replied_id = message.repliedTo;
                        const replyMsg = await Message.findOne({ _id: replied_id });
                        if (replyMsg === null) {
                            messageToPush.repliedTo = {
                                _id: replied_id,
                                username: null,
                                color: null,
                                avatarURL: null,
                                content: "This message was deleted!",
                            };
                        } else {
                            const authorId = replyMsg.user._id;
                            const userDb = await User.findOne({ _id: authorId });

                            messageToPush.repliedTo = {
                                _id: replied_id,
                                username: userDb.username,
                                color: userDb.color,
                                avatarURL: userDb.avatarURL,
                                content: replyMsg.content.slice(0, 32) + "..."
                            };
                        }
                    }
                    return messageToPush;
                });

                try {
                    const allMessages = await Promise.all(messagePromises);
                    const messagesToPush = allMessages.slice(allMessages.length - chunkSize < 0 ? 0 : allMessages.length - chunkSize, allMessages.length);
                    if (allMessages.length <= 15) {
                        return res.send({ messages: allMessages, fetched_all_messages: maxMessages });
                    } else {
                        return res.send({ messages: messagesToPush, fetched_all_messages: maxMessages });
                    }
                } catch (error) {
                    console.log(error);
                    return res.status(418).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
                }
            };
            processMessages();
        } catch (e) {
            console.log(e)
        }
    })

    router.delete("/delete_msg", isAuthorized, async (req, res) => {
        try {
            const messageId = req.query.id;
            const uid = req.decoded.uid;

            const message = await Message.findOne({ _id: messageId });
            if (message.user._id.toString() === uid.toString()) {
                await Message.findOneAndDelete({ _id: messageId });
                res.status(200).send({ success: types.SuccessTypes.SUCCESS });
            }
        } catch (e) {
            console.log(e);
        }
    })

    router.put("/edit_msg", isAuthorized, async (req, res) => {
        try {
            const content = req.body.content;
            const messageId = req.query.id;
            const userId = req.decoded.uid;
            const message = await Message.findOne({ _id: messageId });

            if (message.user._id.toString() !== userId.toString()) return res.status(401).send({ error: types.ErrorTypes.INVALID_CREDENTIALS });

            await Message.findOneAndUpdate({ _id: messageId }, {
                $set: {
                    edited: true,
                    content: content
                }
            });

            res.send({ success: types.SuccessTypes.SUCCESS });
        } catch (e) {
            console.log(e)
        }
    })
}