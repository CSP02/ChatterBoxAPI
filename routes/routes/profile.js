const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Message = require("../../Models/MessageModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const types = new Types();

module.exports = (router) => {
    router.put("/profile", isAuthorized, async (req, res) => {
        const updateUsername = req.body.username;
        const color = req.body.color;
        const avatarURL = req.body.avatarURL;

        try {
            const decoded = req.decoded;

            const userId = decoded.uid;

            const user = {
                username: updateUsername.slice(0, 32),
                color: color.slice(0, 7),
                avatarURL: avatarURL.slice(0, 64),
            };
            const prevUser = await User.findOne({ _id: userId });
            const isUsernameAvailable = await User.find({ username: updateUsername.slice(0, 31) });

            if (isUsernameAvailable.length > 0 && updateUsername !== prevUser.username) return res.send({ content: "Username already exists", success: false });

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
            const updatedUser = await User.findOne({ _id: userId });
            const user2send = {
                _id: updatedUser._id,
                username: updatedUser.username,
                avatarURL: updatedUser.avatarURL,
                color: updatedUser.color
            };

            return res.send({
                content: "User updated successfully",
                success: true,
                updatedUser: user2send,
            });
        } catch (e) {
            console.log(e);
        }
    });
}