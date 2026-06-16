const mongoose = require ("mongoose")
const newschema = new mongoose.Schema({

    name :
    {
        type:String,
        required : true, 
        minlength :3 ,
        maxlength :30 , 
        uppercase: true 
    } , 
 email: {
        type: String,
        unique: true,   
        required: true,
        lowercase: true ,
    match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
    },
    password: {
        type: String,
        required: true ,
        minlength :8 ,
    },
     role:{
     type : String ,
	enum: ["admin", "user"] ,
   default: "user",
 } ,
 createdAt:{
   type :Date  ,
   default: Date.now
 }
})

module.exports=mongoose.model("users",newschema);
