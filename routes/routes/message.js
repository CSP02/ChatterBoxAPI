const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Message = require("../../Models/MessageModel.js");
const Channel = require("../../Models/ChannelModel.js");
const cheerio = require("cheerio");
const {isAuthorized} = require("../middlewares/Authentication.js");
const mongoose = require("mongoose");
const logger = require('../../config/logger.js');
const cloudinary = require('cloudinary');
const { upload, uploadToCloudinary } = require("../middlewares/UploadFile.js");
const fetch = require("node-fetch")

const types = new Types();

async function fetchMetadata(url) {
    try {
        const response = await fetch(url, { method: "GET", timeout: 5000 });

        if (!response.ok) {
            console.error(`Error fetching ${url}: ${response.statusText}`);
            return null;
        }

        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/html")) {
            const text = await response.text();
            const $ = cheerio.load(text);
            return {
                type: types.ComponentTypes.EMBED,
                title: $('meta[property="og:title"]').attr("content") || $('meta[property="title"]').attr("content") || $('title').text() || url,
                description: $("meta[property='og:description']").attr("content") ||
                    $("meta[name='description']").attr("content") ||
                    "No description available",
                image: $("meta[property='og:image']").attr("content") || null,
                url: url.replace("youtube.com", "youtu.be")
            };
        } else if (contentType.includes("image")) {
            return {
                type: contentType.includes("gif") ? types.ComponentTypes.GIF : types.ComponentTypes.IMAGE,
                imageURL: url
            };
        }
    } catch (e) {
        console.error(`Failed to fetch ${url}:`, e);
    }
    return null;
}

async function processUrls(urls) {
    const components = await Promise.all(urls.map(fetchMetadata));
    return components.filter(Boolean);
}

//post message to the database
module.exports = (router) => {
    router.post("/messages", isAuthorized, upload.single("file"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const decodedUserID = decoded.uid;

            const [userInDb, channelInDb] = await Promise.all([
                User.findById(decodedUserID),
                Channel.findById(req.query.channel_id)
            ]);

            if (!userInDb || !channelInDb) return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });

            if (!channelInDb.members.includes(decodedUserID)) {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS, message: "You are not a member of this channel." });
            }

            if ((!req.body.content || typeof req.body.content !== 'string' || req.body.content.trim() === "") && !req.file) {
                return res.status(400).send({ error: types.ErrorTypes.NULL_CONTENT });
            }

            const messageContent = (decodedUserID === "6772a70293782bf60ee938a3") ? req.body.content : req.body.content.slice(0, 500).trim();
            const repliedTo = req.body.repliedTo;

            if (repliedTo && !mongoose.Types.ObjectId.isValid(repliedTo)) {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
            }

            const message = new Message({
                user: userInDb._id,
                content: messageContent,
                timestamp: Date.now(),
                channel: channelInDb._id
            });


            if (repliedTo) {
                const repliedToMessage = await Message.findById(repliedTo);
                if (!repliedToMessage) {
                    return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND, message: "Message to reply to not found." });
                }
                if (repliedToMessage.channel._id.toString() !== req.query.channel_id) return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS });
                message.repliedTo = repliedToMessage;
            }

            const components = [];
            if (req.file) {
                const component = {
                    type: req.file.mimetype === "text/plain" ? types.ComponentTypes.FILE : types.ComponentTypes.IMAGE,
                    title: (req.body.custom_name && req.body.custom_name !== null) ? req.body.custom_name : req.file.originalname,
                    description: "file",
                    publicId: req.file.filename
                }
                const [url, rType] = await uploadToCloudinary(req);
                component.url = url;
                component.resourceType = rType;
                components.push(component);
            }
            const urls = messageContent.split(/\s+/g).filter(messCon => messCon.startsWith("https://"));

            if (urls.length > 0) {
                components.push(...await processUrls(urls));
            }

            message.components = components.length > 0 ? components : [];
            const savedMessage = await message.save();
            await savedMessage.populate({
                path: "repliedTo",
                select: "channel content timestamp _id",
                populate: {
                    path: "user",
                    select: "username avatarURL color -_id"
                }
            });

            return res.status(200).send(savedMessage);

        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });

    router.get("/messages", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const channelId = req.query.channel_id;
            const chunkSize = parseInt(req.query.chunk) || 16;
            const page = parseInt(req.query.page) || 1;

            const channel = await Channel.findById(channelId);
            const userInDb = await User.findById(userId);
            const messLen = (await Message.countDocuments({ channel: channelId }));
            if (!channel || !userInDb) {
                return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });
            }

            if (!channel.members.some(member => member.toString() === userId)) {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS });
            }

            const messagesQuery = Message.find({ channel: channelId })
                .sort({ timestamp: -1 })
                .skip((messLen - page * chunkSize) < 0 ? 0 : (messLen - page * chunkSize))
                .limit(page * chunkSize)
                .sort({ timestamp: 1 })
                .populate("user", "username color avatarURL -_id")
                .populate({
                    path: "repliedTo",
                    select: "content",
                    populate: {
                        path: "user",
                        select: "username color avatarURL -_id"
                    }
                });

            const messages = await messagesQuery.exec();
            const hasMore = (page * chunkSize) < messLen;
            return res.send({
                messages: messages,
                hasMore,
            });
        } catch (error) {
            logger.error(error);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });

    router.delete("/delete_msg", isAuthorized, async (req, res) => {
        try {
            const messageId = req.query.id;
            const uid = req.decoded.uid;

            if (!messageId) {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST, message: "Message ID is required." });
            }

            const message = await Message.findById(messageId);
            if (!message) {
                return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND, message: "Message not found." });
            }

            if (message.user.toString() === uid.toString()) {
                const fileComponents = message.components.filter(component => component.type === types.ComponentTypes.FILE);
                fileComponents.forEach(async component => {
                    const publicId = component.publicId;
                    console.log(component)
                    await cloudinary.v2.api.delete_resources(["chatterbox/files/" + publicId], { type: 'upload', resource_type: component.resourceType.toString() }).then(e => console.log(e)).catch(e => console.log(e));
                });
                await Message.findByIdAndDelete(messageId);
                return res.status(200).send({ success: types.SuccessTypes.SUCCESS });
            } else {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS, message: "You are not authorized to delete this message." });
            }
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR, message: e.message });
        }
    });


    router.put("/edit_msg", isAuthorized, async (req, res) => {
        const { content } = req.body;
        const messageId = req.query.id;
        const userId = req.decoded.uid;

        try {
            if (!messageId || !content || typeof content !== 'string' || content.trim() === "") {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST, message: "Message ID and content are required." });
            }

            if (content.trim().length > 500 && userId !== "6772a70293782bf60ee938a3") return res.status(418).send({ error: types.ErrorTypes.MESSAGE_LEN_LIMIT });

            const message = await Message.findById(messageId);
            if (!message) {
                return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND, message: "Message not found." });
            }

            if (message.user.toString() !== userId.toString()) {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS, message: "You are not authorized to edit this message." });
            }

            await Message.findByIdAndUpdate(messageId, {
                $set: {
                    edited: true,
                    content: content
                }
            });

            return res.status(200).send({ success: types.SuccessTypes.SUCCESS });
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR, message: "An error occurred while editing the message." });
        }
    });

}