const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const Message = require("../../Models/MessageModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const cloudinary = require('cloudinary');
const fs = require("fs");
const multer = require("multer");
const types = new Types();

module.exports = (router) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/users/');
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        },
    });

    const upload = multer({ storage: storage, limits: { fileSize: 1000000 } });

    router.put("/profile", isAuthorized, upload.single("pfp"), async (req, res, err) => {
        const updateUsername = req.body.username;
        const color = req.body.color;

        try {
            const decoded = req.decoded;
            const userId = decoded.uid;

            const result = await cloudinary.v2.uploader
                .upload("uploads/users/" + req.file.originalname, {
                    folder: 'chatterbox/pfps/',
                    resource_type: 'image',
                    public_id: userId
                });
            const avatarURL = result.secure_url;

            fs.rm("uploads/" + req.file.originalname, (err) => {
                if (err) throw err;
            });

            const user = {
                username: updateUsername.slice(0, 32),
                color: color.slice(0, 7),
                avatarURL: avatarURL,
            };
            const prevUser = await User.findOne({ _id: userId });
            const isUsernameAvailable = await User.find({ username: updateUsername.slice(0, 31) });

            if (isUsernameAvailable.length > 0 && updateUsername !== prevUser.username) return res.send({ error: types.ErrorTypes.ALREADY_EXISTS });

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
                success: types.SuccessTypes.SUCCESS,
                updatedUser: user2send,
            });
        } catch (e) {
            console.log(e);
        }
    });
}