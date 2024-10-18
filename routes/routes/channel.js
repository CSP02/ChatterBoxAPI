const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const types = new Types();

module.exports = (router) => {
    router.get("/channels", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid;
            const user = await User.findOne({ _id: userId });
            const userChannels = user.channels;

            const channelsData = [];

            userChannels.forEach(channel => {
                channelsData.push({
                    iconURL: channel.iconURL,
                    name: channel.name,
                    _id: channel._id
                });
            });

            return res.status(200).send({ channels: channelsData });
        } catch (e) {
            console.log(e);
        }
    })

    router.post("/channels", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;

            const userId = decoded.uid;
            const authorInDb = await User.findOne({ _id: userId });

            const author = {
                _id: authorInDb._id,
                username: authorInDb.username,
                avatarURL: authorInDb.avatarURL,
                color: authorInDb.color
            };

            const groupMembers = [];
            groupMembers.push(author);

            const channelName = req.body.channelName;
            const iconURL = req.body.iconURL ? iconURL : "";

            const channel = new Channel({
                name: channelName,
                iconURL: iconURL,
                author: author,
                members: groupMembers
            });

            const user = await User.findOne({ _id: userId });

            if (user.channels.length >= 10) return res.send({ error: types.ErrorTypes.CHANNEL_LIMIT });
            await channel.save();
            await User.findOneAndUpdate({ _id: userId },
                {
                    $push: {
                        channels: channel
                    },
                });
            return res.send({ channel: channel });
        } catch (e) {
            console.log(e);
        }
    })

    router.get("/add_user", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;

            const userId = decoded.uid;

            const username = req.query.username;
            const channelId = req.query.channel_id;

            const user = await User.findOne({ username: username });
            const channel = await Channel.findOne({ _id: channelId });


            const membersInChannel = channel.members;

            const userToPush = {
                _id: user._id,
                username: user.username,
                avatarURL: user.avatarURL,
                color: user.color
            };

            if (JSON.stringify(channel.author._id) !== JSON.stringify(userId)) return res.status(401).send({ error: types.ErrorTypes.PERMISSIONS });
            if (membersInChannel.filter(member => member._id.toString() === user._id.toString()).length > 0) return res.send({ error: types.ErrorTypes.USER_ALREADY_EXIST });

            const channelToPush = {
                _id: channel._id,
                name: channel.name,
                iconURL: channel.iconURL,
                author: channel.author
            };

            membersInChannel.push(userToPush);

            const updatedChannel = await Channel.findOneAndUpdate({ _id: channelId }, {
                $set: {
                    members: membersInChannel
                }
            });

            const updatedUser = await User.findOneAndUpdate({ username: username }, {
                $push: {
                    channels: channelToPush
                }
            })
            return res.send({ invited: userToPush })
        } catch (err) {
            console.log(err)
        }
    })
}