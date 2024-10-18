/**
 * ? Imports
 */
const express = require("express");
const router = express.Router();
const fs = require("fs");

const routes = fs.readdirSync("./routes/routes").filter(file => file.endsWith("js"));

routes.forEach(route => {
    require(`./routes/${route}`)(router);
})

module.exports = router;