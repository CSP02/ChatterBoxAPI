const { Types } = require("../types.js");
const { check, validationResult } = require('express-validator');
const bcrypt = require("bcrypt");
const User = require("../../Models/UserModel.js");
const Channel = require("../../Models/ChannelModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const types = new Types();

const saltRounds = 10;

module.exports = (router) => {
    router.post("/signup", [
        check('username').trim().isLength({ min: 3, max: 32 }),
        check('password').isLength({ min: 8, max: 32 }),
        check('color').isHexColor()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const username = req.body.username.replaceAll(" ", "_").slice(0, 31);
        const color = req.body.color.toString();
        const avatarURL = req.body.avatarURL;

        bcrypt.hash(req.body.password, saltRounds, async (err, hashedPassword) => {
            const password = hashedPassword;
            const userDb = await User.find({ username });

            const user = new User({
                username: username,
                password: password,
                color: color.slice(0, 6),
                avatarURL: avatarURL.slice(0, 128)
            });

            try {
                if (userDb.length > 0)
                    return res.status(400).send({ error: types.ErrorTypes.UNAME_NOT_AVAILABLE });

                const userData = await user.save();
                return res.send({ user: userData });
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
            const member = await User.findById(members[i]._id);
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