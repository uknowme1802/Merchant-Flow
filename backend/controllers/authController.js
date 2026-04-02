require('dotenv').config();
const jwt = require("jsonwebtoken");

const SECRET = process.env.SECRET;

exports.login=(req,res)=>{
    const{email, password}=req.body;
        //Dummy for test
    if (email==="admin@test.com" && password==="Logincode@10"){
        const user = {
            email,
            role:"admin"
        };
        const token = jwt.sign(user,
        SECRET,
        { expiresIn: "1h" }
        );
        
        return res.json({
            success:true,
            token,
            user
        });
    }

    if (email==="user@test.com" && password==="Logincode@10"){
        const user = { email, role: "user" }
        const token = jwt.sign(
            user,
            SECRET,
            {expiresIn: "1h"}
        );

        return res.json({
            success:true,
            token,
            user
        })
    }

    return res.status(401).json({
        success:false,
        message:"Invalid Credentials"
    });
};

