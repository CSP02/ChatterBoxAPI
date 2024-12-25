const { Types } = require("../types.js");
const User = require("../../Models/UserModel.js");
const isAuthorized = require("../middlewares/Authentication.js");
const types = new Types();

module.exports = (router) => {
    router.get("/logout", isAuthorized, async (req, res) => {
        const decoded = req.decoded;
        const uid = decoded.uid;

        const user = await User.findOne({ _id: uid });
        user.status = 0;
        user.save();

        return res.status(200).send({ success: types.SuccessTypes.SUCCESS });
    });

    router.get("/make_offline", async (req, res) => {
        try {
            const key = req.query.key;
            const username = req.query.uname;

            if (key === process.env.key) {
                const user = await User.findOne({ username: username });
                user.status = 0;
                user.save();

                return res.status(200);
            } else {
                return res.status(401).send({ error: types.ErrorTypes.INVALID_CREDENTIALS });
            }
        } catch (e) {
            console.log(e)
            return res.status(408);
        }
    });

    router.get("/make_online", async (req, res) => {
        try {
            const key = req.query.key;
            const username = req.query.uname;

            if (key === process.env.key) {
                const user = await User.findOne({ username: username });
                user.status = 1;
                await user.save();

                return res.status(200).send({success: types.SuccessTypes.SUCCESS});
            } else {
                return res.status(401).send({ error: types.ErrorTypes.INVALID_CREDENTIALS });
            }
        } catch (e) {
            console.log(e)
            return res.status(408).send({error: types.ErrorTypes.UNKNOWN_ERROR});
        }
    });
}