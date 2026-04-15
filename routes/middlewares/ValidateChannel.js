const { Types } = require("../types.js");
const types = new Types;
const logger = require('../../config/logger.js');

const validateChannel = async (req, res, next) => {
    try {
        const channelName = await req.body.channelName !== undefined ? req.body.channelName.trim() : req.query.channelName.trim();
        if (!channelName || channelName.length > 100) {
            return res.status(400).send({ error: types.ErrorTypes.INVALID_CHANNEL });
        }

        next();
    } catch (e) {
        logger.error(e);
        return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
    }
};

const validateUser = async (req, res, next) => {
    try {
        let username = null;
        
        if(await req.body.username){
            username = req.body.username.trim();
        }else if(await req.query.username){
            username = req.query.username.trim();
        }
        
        if (username && username.length > 100) {
            return res.status(400).send({ error: types.ErrorTypes.INVALID_USERNAME });
        }

        next();
    } catch (e) {
        console.log(e)
        logger.error(e);
        return res.status(500).send({ error: types.ErrorTypes.UNKNOWN_ERROR });
    }
};

module.exports = { validateChannel, validateUser };