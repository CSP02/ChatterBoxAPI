const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const cloudinary = require('cloudinary');
const fs = require("fs");
const multer = require("multer");
const types = new Types();

module.exports = (router) => {
    router.get("/channels", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const user = await User.findById(userId);
            const userChannels = user.channels;

            const channelsData = [];

            Promise.all(userChannels.map(async (channelId) => {
                const channel = await Channel.findById(channelId);
                channelsData.push({
                    iconURL: channel.iconURL,
                    name: channel.name,
                    _id: channel._id
                });
            })).then(() => {
                return res.status(200).send({ channels: channelsData });
            }).catch(error => {
                console.error(error);
                return res.status(500).send({ error: 'An error occurred' });
            });
        } catch (e) {
            console.log(e);
        }
    });


    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/channels/');
        },
        filename: (req, file, cb) => {
            if (file)
                cb(null, file.originalname);
        },
    });

    const upload = multer({ storage: storage, limits: { fileSize: 1000000 } });

    router.post("/channels", isAuthorized, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;

            const groupMembers = [];
            groupMembers.push(userId);

            const channelName = req.body.channelName;

            const channel = new Channel({
                name: channelName,
                author: userId,
                members: groupMembers
            });

            let result = null;
            if (req.file)
                result = await cloudinary.v2.uploader
                    .upload("uploads/channels/" + req.file.originalname, {
                        folder: 'chatterbox/channelIcons/',
                        resource_type: 'image',
                        public_id: channel._id
                    });
            const iconURL = result !== null ? result.secure_url : result;
            channel.iconURL = iconURL;
            if (req.file)
                fs.rm("uploads/channels/" + req.file.originalname, (err) => {
                    if (err) throw err;
                });

            const user = await User.findById(userId);

            if (user.channels.length >= 10) return res.send({ error: types.ErrorTypes.CHANNEL_LIMIT });
            await channel.save();
            await User.findOneAndUpdate({ _id: userId },
                {
                    $push: {
                        channels: channel._id
                    },
                });
            return res.send({ channel: channel });
        } catch (e) {
            console.log(e);
        }
    });

    router.put("/channels", isAuthorized, upload.single("channelIcon"), async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const channelId = req.query.id;

            const channelName = req.body.channelName;
            const channel = {
                name: channelName
            }
            channel.name = channelName;

            let result = null
            if (req.file)
                result = await cloudinary.v2.uploader
                    .upload("uploads/channels/" + req.file.originalname, {
                        folder: 'chatterbox/channelIcons/',
                        resource_type: 'image',
                        public_id: channelId
                    });

            const iconURL = result !== null ? result.secure_url : result;
            channel.iconURL = iconURL;

            if (req.file)
                fs.rm("uploads/channels/" + req.file.originalname, (err) => {
                    if (err) throw err;
                });

            const user = await User.findById(userId);

            if (user.channels.length >= 10) return res.send({ error: types.ErrorTypes.CHANNEL_LIMIT });
            await Channel.findOneAndUpdate({ _id: channelId }, channel);
            return res.send({ channel: channel });
        } catch (e) {
            console.log(e);
        }
    })

    router.get("/add_user", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const username = req.query.username;
            const channelId = req.query.channel_id;

            const userId = decoded.uid;
            const user = await User.findOne({ username: username });
            const channel = await Channel.findById(channelId);
            const membersInChannel = await channel.members.filter(member => member === user._id);

            const userToPush = {
                _id: user._id,
                username: user.username,
                avatarURL: user.avatarURL,
                color: user.color
            };

            if (JSON.stringify(channel.author._id) !== JSON.stringify(userId)) return res.status(401).send({ error: types.ErrorTypes.PERMISSIONS });
            if (membersInChannel.length !== 0) return res.status(403).send({ error: types.ErrorTypes.ALREADY_EXISTS });

            await Channel.findOneAndUpdate({ _id: channelId }, {
                $push: {
                    members: user._id
                }
            });

            await User.findOneAndUpdate({ username: username }, {
                $push: {
                    channels: channelId
                }
            })
            return res.send({ invited: userToPush })
        } catch (err) {
            console.log(err)
        }
    })
}