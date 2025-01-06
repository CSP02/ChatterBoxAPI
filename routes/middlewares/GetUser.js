const User = require('../../Models/UserModel.js');
const { Types } = require('../types.js');
const types = new Types;
const logger = require('../../config/logger.js');

const getUser = async (req, res, next) => {
    try {
        const decoded = req.decoded;
        const userId = decoded.uid;

        const user = await User.findById(userId);
        if (!user) return res.status(404).send({ error: types.ErrorTypes.NOT_FOUND });

        req.user = {
            username: user.username,
            avatarURL: user.avatarURL,
            color: user.color,
        };

        next();
    } catch (error) {
        logger.error(error);
        return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
    }
};

module.exports = getUser;