const User = require("../../Models/UserModel.js");
const jwt = require("jsonwebtoken");
const isAuthorized = require("../middlewares/Authentication.js");
const { Types } = require("../types.js");
const types = new Types;

module.exports = (router) => {
    router.get("/request_new_token", isAuthorized, async (req, res) => {
        try{
            const decoded = req.decoded;
    
            const user = await User.findOne({ _id: decoded.uid });
            const newToken = jwt.sign(
                { uid: user._id },
                process.env.JWT_SECRET,
                { expiresIn: "10m" }
            );
    
            const newRefreshToken = jwt.sign(
                { uid: user._id },
                process.env.JWT_SECRET,
                { expiresIn: "10h" }
            );
    
            return res.send({ token: newToken, refreshToken: newRefreshToken });
        }catch(e){
            return res.status(518).send({error: types.ErrorTypes.UNKNOWN_ERROR});
        }
    })
}