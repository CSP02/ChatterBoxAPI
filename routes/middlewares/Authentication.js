const jwt = require("jsonwebtoken");
const { Types } = require("../types.js")

const types = new Types()
const isAuthorized = async (req, res, next) => {
    if (!req.headers["authorization"]) return res.status(401).send({ error: types.ErrorTypes.NULL_TOKEN })

    const [scheme, token] = req.headers.authorization.split(" ")
    if (!token) return res.status(401).send({ error: types.ErrorTypes.NULL_TOKEN })
    try {
        req.decoded = jwt.verify(token, process.env.JWT_SECRET, { complete: true })
    } catch (e) {
        if (e.message === "jwt expired") return res.status(401).send({ error: types.ErrorTypes.JWT_EXPIRE })
        else return res.send(401).send({error: types.ErrorTypes.VERIFICATION_FAILED})
    }
    return next()
}

module.exports = isAuthorized