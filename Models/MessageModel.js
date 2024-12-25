const mongoose = require('mongoose');

/**
 * ? message schema
 */
const messageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        require: true
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
        type: mongoose.Types.ObjectId,
        require: true
    },
    repliedTo: {
        type: mongoose.Types.ObjectId
    },
    edited: {
        type: Boolean,
        default: false,
    }
})

module.exports = mongoose.model('Message', messageSchema)