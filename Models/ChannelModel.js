const mongoose = require('mongoose');

/**
 * ? user schema which contains channel name, icon url, author and users
 */
const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    iconURL: {
        type: String,
        required: false
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "User"
    },
    members: {
        type: [mongoose.Schema.Types.ObjectId],
        required: true,
        default: [this.author],
        ref: "User"
    }
})

module.exports = mongoose.model('Channel', channelSchema)