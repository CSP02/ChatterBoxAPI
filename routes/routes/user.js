const { Types } = require("../types.js");
const { check, validationResult } = require('express-validator');
const bcrypt = require("bcrypt");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const cloudinary = require('cloudinary');
const fs = require("fs");
const multer = require("multer");
const types = new Types();

const saltRounds = 10;

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

    router.post("/signup", upload.single("avatarURL"), async (req, res) => {
        const username = req.body.username.replaceAll(/\s+/g, "_").slice(0, 31);
        const color = req.body.color.toString();

        bcrypt.hash(req.body.password, saltRounds, async (err, hashedPassword) => {
            try {
                const password = hashedPassword;
                const userDb = await User.findOne({ username });

                const user = new User({
                    username: username,
                    password: password,
                    color: color.slice(0, 6),
                });

                const result = await cloudinary.v2.uploader
                    .upload("uploads/users/" + req.file.originalname, {
                        folder: 'chatterbox/pfps/',
                        resource_type: 'image',
                        public_id: user._id
                    });
                const avatarURL = result.secure_url;

                fs.rm("uploads/users/" + req.file.originalname, (err) => {
                    if (err) throw err;
                });
                user.avatarURL = avatarURL;
                if (userDb && userDb.length > 0)
                    return res.status(400).send({ error: types.ErrorTypes.UNAME_NOT_AVAILABLE });

                const userData = await user.save();
                return res.status(200).send({ user: userData });
            } catch (error) {
                console.log(error);
            }
        });
    });

    router.get("/get_users", isAuthorized, async (req, res) => {
        if (!req.query) return res.send({ error: types.ErrorTypes.INVALID_REQUEST });
        const cid = req.query.cid;

        const channel = await Channel.findById(cid);
        const members = channel.members;
        const mem2push = [];
        for (let i = 0; i < members.length; i++) {
            const member = await User.findById(members[i]);
            const mem = {
                username: member.username,
                avatarURL: member.avatarURL,
                status: member.status,
                color: member.color
            };
            mem2push.push(mem);
        }

        return res.status(200).send({ members: mem2push });
    })

    router.get("/search_user", isAuthorized, async (req, res) => {
        const username = req.query.username;
        try {
            const user = await User.findOne({ username });

            if (user) return res.send({ username: user.username, avatarURL: user.avatarURL });
            res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });
        } catch (e) {
            console.log(e);
        }
    })
}