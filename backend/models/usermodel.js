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
        required: false,
        minlength :8 ,
    },
    googleSub: {
        type: String,
        default: undefined,
        select: false,
    },
    appleSub: {
        type: String,
        default: undefined,
        select: false,
    },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: undefined },
    authVersion: { type: Number, default: 0 },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    emailVerificationSentAt: { type: Date, select: false },
    emailVerificationReturnTo: { type: String, select: false },
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

newschema.index({ googleSub: 1 }, { unique: true, sparse: true });
newschema.index({ appleSub: 1 }, { unique: true, sparse: true });

module.exports=mongoose.model("users",newschema);
