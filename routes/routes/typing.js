const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const logger = require('../../config/logger.js');

module.exports = (router) => {
    router.get("/typing", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;
            const userId = decoded.uid

            const channelId = req.query.channel_id
            await Channel.findOne({ _id: channelId }).then(channel => {
                const isMemberInChannel = channel.members.some(member => member._id.toString() === userId.toString())
                if(isMemberInChannel) return res.send({ success: true });
                return res.send({ success: false });
            })
        } catch (err) {
            logger.error(err)
        }
    })
}