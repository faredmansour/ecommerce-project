const mongoose = require ("mongoose")
const catschema = new mongoose.Schema({

    name :
    {
        type:String,
        required : true, 
        
    } , 
 description : {
    type:String,
      required : true, 
     


    },
 
 createdAt:{
   type :Date  ,
   default: Date.now
 }
})

module.exports=mongoose.model("Categories",catschema);