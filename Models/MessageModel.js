const mongoose = require('mongoose');

/**
 * ? message schema
 */
const messageSchema = new mongoose.Schema({
    user: {
        type: Object,
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
        type: Object,
        require: true
    }
})

module.exports = mongoose.model('Message', messageSchema)