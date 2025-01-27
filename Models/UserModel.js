const mongoose = require('mongoose');

/**
 * ? user schema which contains username, password, avatar url and coloe prefered
 */
const userSchema = new mongoose.Schema({
    username: {
        required: true,
        type: String
    },
    password: {
        required: true,
        type: String
    },
    avatarURL: {
        type: String,
        required: false
    },
    color: {
        type: String,
        required: true,
        default: "#ffffff"
    },
    channels: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "Channel"
    },
    status: {
        type: Number,
        default: 0
    }
})

module.exports = mongoose.model('User', userSchema)