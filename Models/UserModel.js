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
        default: "#ff0000"
    },
    channels: {
        type: [Object]
    }
})

module.exports = mongoose.model('User', userSchema)