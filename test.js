const jwt = require("jsonwebtoken");
require("dotenv").config()

parseJwt("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI2NWU2ZmIyZTNkNTIwZGFiMmFhZThjNTIiLCJpYXQiOjE3MjIwNjU4MDYsImV4cCI6MTcyMjA2NjQwNn0.NvtwHinEzveAdXfq_8-Vl6NvUs20oqNbQw7DSzPuKEA");
jwtDecode("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI2NWU2ZmIyZTNkNTIwZGFiMmFhZThjNTIiLCJpYXQiOjE3MjIwNjU4MDYsImV4cCI6MTcyMjA2NjQwNn0.NvtwHinEzveAdXfq_8-Vl6NvUs20oqNbQw7DSzPuKEA")
function parseJwt(token) {
    console.time("parse without verify")
    JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    console.timeEnd("parse without verify")
}

function jwtDecode(token){
    console.time("parse with verify")
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        complete: true,
    })
    console.timeEnd("parse with verify")
}