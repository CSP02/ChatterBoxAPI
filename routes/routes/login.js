/**
 * ? Imports
 */
const { Types } = require("../types.js");
const bcrypt = require("bcrypt");
const User = require("../../Models/UserModel.js");
const jwt = require("jsonwebtoken");
const logger = require('../../config/logger.js');

const types = new Types();

module.exports = (router) => {
    router.post("/login", async (req, res) => {
        try {
            const username = req.body.username;
            const password = req.body.password;
            const user = await User.findOne({ username });
            const secret = process.env.JWT_SECRET;

            if (user) {
                bcrypt.compare(password, user.password, async (err, result) => {
                    const token = jwt.sign(
                        { uid: user._id },
                        secret,
                        { expiresIn: "10m" }
                    );

                    const refreshToken = jwt.sign(
                        { uid: user._id },
                        secret,
                        { expiresIn: "10h" }
                    );

                    if (result) {
                        const userFound = {
                            username: user.username,
                            color: user.color,
                            avatarURL: user.avatarURL,
                            status: 1
                        };
                        user.status = 1;
                        user.save();
                        return res.send({ user: userFound, token: token, refreshToken: refreshToken });
                    }
                    return res.status(401).send({ error: types.ErrorTypes.INVALID_CREDENTIALS });
                });
            } else {
                return res.status(400).send({ error: types.ErrorTypes.NOT_FOUND });
            }
        } catch (e) {
            logger.error(e);
            res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
        }
    });
}