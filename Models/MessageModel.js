const mongoose = require('mongoose');

/**
 * ? message schema
 */
const messageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        require: true,
        ref: "User"
    },
    content: {
        require: true,
        type: String
    },
    components: {
        type: [Object]
    },
    timestamp: {
        type: Date
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        require: true,
        ref: "Channel"
    },
    repliedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message"
    },
    edited: {
        type: Boolean,
        default: false,
    }
})

module.exports = mongoose.model('Message', messageSchema)