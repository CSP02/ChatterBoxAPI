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
        type: Object,
        required: true
    },
    members: {
        type: [Object],
        required: true,
        default: [this.author]
    }
})

module.exports = mongoose.model('Channel', channelSchema)