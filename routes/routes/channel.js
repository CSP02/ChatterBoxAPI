const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const getUser = require("../middlewares/GetUser.js");
const { validateChannel, validateUser } = require("../middlewares/ValidateChannel.js");
const { uploadToCloudinary, upload } = require("../middlewares/UploadImage.js");
const types = new Types();
const logger = require('../../config/logger.js');
const mongoose = require('mongoose');

module.exports = (router) => {
    router.get("/channels", isAuthorized, async (req, res) => {
        try {
            const user = await User.findById(req.decoded.uid);
            const channelsData = await Channel.find({ _id: { $in: user.channels } }, 'iconURL name _id');
            res.send({ channels: channelsData });
        } catch (e) {
            logger.error(e);
            res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });

    router.post("/channels", isAuthorized, getUser, validateChannel, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const groupMembers = [userId];

            const channel = new Channel({
                name: channelName,
                author: userId,
                members: groupMembers
            });

            channel.iconURL = await uploadToCloudinary(req, channel._id, 'channelIcons');

            if (req.user.channels.length >= 10) return res.send({ error: types.ErrorTypes.CHANNEL_LIMIT });
            await channel.save();
            const user = await User.findOneAndUpdate(
                { _id: userId, $expr: { $lt: [{ $size: "$channels" }, 10] } },
                { $push: { channels: channel._id } },
                { new: true }
            );
            if (!user) {
                return res.status(400).send({ error: types.ErrorTypes.CHANNEL_LIMIT });
            }
            return res.send({ channel: channel });
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: 'An unexpected error occurred' });
        }
    });

    router.put("/channels", isAuthorized, validateChannel, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const channelId = req.query.id;
            const channelName = req.body.channelName;

            if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
            }

            const channel = {
                name: channelName
            };
            const channelToUpdate = await Channel.findById(channelId);
            if (!channelToUpdate || channelToUpdate.author.toString() !== userId) {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS });
            }
            channel.iconURL = await uploadToCloudinary(req, channelId, 'channelIcons', channelToUpdate.iconURL);

            return res.send({ channel: channel });
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })

    router.get("/add_user", isAuthorized, validateUser, async (req, res) => {
        try {
            const decoded = req.decoded;
            const username = req.query.username;
            const channelId = req.query.channel_id;

            const userId = decoded.uid;
            const user = await User.findOne({ username: username });
            const channel = await Channel.findById(channelId);
            if (!user || !channel) {
                return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });
            }
            const isMember = channel.members.some(member => member.toString() === user._id.toString());
            if (isMember) {
                return res.status(403).send({ error: types.ErrorTypes.ALREADY_EXISTS });
            }

            if (channel.author.toString() !== userId) {
                return res.status(401).send({ error: types.ErrorTypes.PERMISSIONS });
            }

            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                await Channel.findOneAndUpdate(
                    { _id: channelId },
                    { $push: { members: user._id } },
                    { session }
                );
                await User.findOneAndUpdate(
                    { username },
                    { $push: { channels: channelId } },
                    { session }
                );
                await session.commitTransaction();
            } catch (error) {
                await session.abortTransaction();
                throw error;
            } finally {
                session.endSession();
            }

            const userToPush = {
                _id: user._id,
                username: user.username,
                avatarURL: user.avatarURL,
                color: user.color
            };

            return res.send({ invited: userToPush });
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })
}