const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");

module.exports = (router) => {
    router.get("/typing", isAuthorized, async (req, res) => {
        try {
            const decoded = req.decoded;

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
            console.log(err)
        }
    })
}