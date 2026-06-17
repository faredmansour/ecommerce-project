const joi = require("joi");

const registerschema = joi.object({
    name: joi.string().min(3).max(50).required(),
    
    email: joi.string().email().required(),

    password: joi.string().min(8).required(),

    role: joi.string().valid("user", "admin").default("user")
});

const loginschema = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(8).required()
});

module.exports = {
    registerschema,
    loginschema
};