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
    })
}