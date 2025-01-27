const { Types } = require("../types.js");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const { upload, uploadToCloudinary } = require("../middlewares/UploadImage.js");
const types = new Types();
const logger = require("../../config/logger.js");

const saltRounds = 10;

module.exports = (router) => {
    router.post("/signup", upload.single("avatarURL"), async (req, res) => {
        const username = req.body.username.replaceAll(/\s+/g, "_").slice(0, 31);
        const color = req.body.color.toString();
        if (!username || username.length < 3 || username.length > 31 || !/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send({ error: types.ErrorTypes.UNAME_NOT_AVAILABLE });
        }

        const password = req.body.password;
        if (!password || password.length < 8) {
            return res.status(400).send({ error: 'Password must be at least 8 characters long' });
        }

        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
            return res.status(400).send({ error: 'Invalid color format' });
        }

        bcrypt.hash(password, saltRounds, async (err, hashedPassword) => {
            try {
                const password = hashedPassword;
                const user = new User({
                    username: username,
                    password: password,
                    color: color.slice(0, 7),
                });

                user.avatarURL = uploadToCloudinary(req, user._id, 'pfps');
                const userData = await user.save();
                return res.status(200).send({ user: userData });
            } catch (e) {
                logger.error(e);
            }
        });
    });

    router.get("/get_users", isAuthorized, async (req, res) => {
        try {
            const cid = req.query.cid;
            const uid = req.decoded.uid;
            if (!cid || !mongoose.Types.ObjectId.isValid(cid)) {
                return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
            }

            const channel = await Channel.findById(cid);
            if (!channel) {
                return res.status(404).send({ error: 'Channel not found' });
            }
            
            if (!channel.members.some(user => user.toString() === uid)) return res.status(403).send({ error: types.ErrorTypes.PERMISSIONS });

            const members = await User.find({ _id: { $in: channel.members } }, 'username avatarURL status color -_id');

            return res.status(200).send({ members: members });
        } catch (e) {
            logger.error(e);
            return res.status(518).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })

    router.get("/search_user", isAuthorized, async (req, res) => {
        const username = req.query.username;
        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            return res.status(400).send({ error: types.ErrorTypes.INVALID_REQUEST });
        }

        try {
            const user = await User.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });

            if (!user)
                return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });
            res.send({ username: user.username, avatarURL: user.avatarURL });
        } catch (e) {
            logger.error(e);
            res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    })
}