const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const { isAuthorized, isInviteAuthorized } = require("../middlewares/Authentication.js");
const getUser = require("../middlewares/GetUser.js");
const { validateChannel, validateUser } = require("../middlewares/ValidateChannel.js");
const { uploadToCloudinary, upload } = require("../middlewares/UploadImage.js");
const types = new Types();
const logger = require('../../config/logger.js');
const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");

module.exports = (router) => {
    router.get("/channels", isAuthorized, async (req, res) => {
        try {
            const user = await User.findById(req.decoded.uid);
            const channelsData = await Channel.find({ _id: { $in: user.channels } }, 'iconURL name public _id');
            res.send({ channels: channelsData });
        } catch (e) {
            logger.error(e);
            res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });

    router.post("/channels", isAuthorized, getUser, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const groupMembers = [userId];

            if (!req.body.channelName || req.body.channelName === "" || req.body.channelName === null) return res.status(403).send({ error: types.ErrorTypes.INVALID_CHANNEL });

            const channel = new Channel({
                name: req.body.channelName,
                author: userId,
                members: groupMembers
            });
            if (req.body.channelIcon)
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

    router.put("/channels", isAuthorized, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const channelId = req.query.id;
            const channelName = req.body.channelName;
            const public = req.body.public;

            if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
            }

            const channel = {
                name: channelName,
                public: public
            };
            const channelToUpdate = await Channel.findById(channelId);
            if (!channelToUpdate || channelToUpdate.author.toString() !== userId) {
                return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS });
            }
            channel.iconURL = await uploadToCloudinary(req, channelId, 'channelIcons', channelToUpdate.iconURL);
            await Channel.findOneAndUpdate({ _id: channelId }, {
                $set: {
                    name: channelName,
                    iconURL: channel.iconURL,
                    public: public
                }
            });

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
    });

    router.get("/search_channel", isAuthorized, isInviteAuthorized, async (req, res) => {
        try {
            const channelId = req.cdetails.cid;
            const uid = req.decoded.uid;
            const channelDb = await Channel.findById(channelId);
            const channel = {
                name: channelDb.name,
                iconURL: channelDb.iconURL
            }
            if (channelDb.members.some(member => member._id.toString() === uid.toString())) channel.exists = true;
            if (!channel) return res.status(400).send({ error: types.ErrorTypes.NOT_FOUND });

            return res.send(channel);
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })

    router.get("/generate_invite", isAuthorized, async (req, res) => {
        try {
            const channelId = req.query.channelId;
            const uid = req.decoded.uid;

            const channel = await Channel.findById(channelId);
            if (!channel.public) return res.status(403).send({ error: types.ErrorTypes.INVALID_REQUEST });
            if (channel.author._id.toString() === uid.toString()) {
                const token = jwt.sign(
                    { cid: channelId },
                    process.env.JWT_INVITE_SECRET,
                    { expiresIn: "7d" }
                );

                return res.send({ inviteCode: token });
            }
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });

    router.get("/join_channel", isAuthorized, isInviteAuthorized, async (req, res) => {
        try {
            const channelId = req.cdetails.cid;
            const userId = req.decoded.uid;

            const channelDb = await Channel.findById(channelId);
            if (channelDb.members.some(member => member._id.toString() === userId)) return res.status(403).send({ error: types.ErrorTypes.ALREADY_EXISTS });
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                await Channel.findOneAndUpdate(
                    { _id: channelId },
                    { $push: { members: userId } },
                    { session }
                );
                await User.findOneAndUpdate(
                    { _id: userId },
                    { $push: { channels: channelId } },
                    { session }
                );
                await session.commitTransaction();

                return res.send({ success: types.SuccessTypes.SUCCESS });
            } catch (error) {
                await session.abortTransaction();
                throw error;
            } finally {
                session.endSession();
            }
        } catch (e) {
            logger.error(e);
            return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })
}