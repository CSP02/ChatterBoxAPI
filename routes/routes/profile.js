const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const types = new Types();
const {upload, uploadToCloudinary} = require("../middlewares/UploadImage.js");
const logger = require('../../config/logger.js');

module.exports = (router) => {
    router.put("/profile", isAuthorized, upload.single("pfp"), async (req, res, err) => {
        const updateUsername = req.body.username;
        const color = req.body.color;

        if (!updateUsername || typeof updateUsername !== 'string' || updateUsername.trim().length === 0 || updateUsername.trim().length > 32) {
            return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
        }

        if (!/^#[0-9A-F]{6}$/i.test(color)) {
            return res.status(400).send({ error: 'Invalid color format' });
        }

        try {
            const decoded = req.decoded;
            const userId = decoded.uid;

            const prevUser = await User.findOne({ _id: userId });
            const user = {
                username: updateUsername,
                color: color,
                avatarURL: prevUser.avatarURL
            };
            const isUsernameAvailable = await User.find({ username: updateUsername });
            if (isUsernameAvailable && updateUsername !== prevUser.username) {
                return res.status(400).send({ error: types.ErrorTypes.ALREADY_EXISTS });
            }
            user.avatarURL = await uploadToCloudinary(req, userId, 'pfps', prevUser.avatarURL);

            await User.findOneAndUpdate({ _id: userId }, user);
            const updatedUser = await User.findOne({ _id: userId }, '_id username avatarURL color');

            return res.send({
                success: types.SuccessTypes.SUCCESS,
                updatedUser: updatedUser,
            });
        } catch (e) {
            logger.error(e);
        }
    });
}