const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.createUser = async (req, res)=>{
    try{
        const {email, password, role} = req.body;

        if(!email || !password){
            return res.status(400).json({
                success: false,
                message: "Email and password are required!"
            })
        }

        const hashdePassword = await bcrypt.hash(password,10)

        const user = new User({email: email.toLowerCase(), 
                                password: hashdePassword, 
                                role: role==="admin" ? "admin" : "user"});
        await user.save();

        const {password:_omit, refreshToken:_omit2, ...safeUser} = user.toObject();

        res.status(201).json({
            success: true,
            user: safeUser
        });

    } catch (error){
        if(error.code === 11000){
            return res.status(409).json({success: false, message: "Email already in use"})
        }
        res.status(500).json({message:"Error creating user"});
    }   
}

exports.getUsers = async (req, res) =>{
    try{
        const users = await User.find();
        res.json({success: true, users});
    } catch(err){
        res.status(500).json({success: false, message: "Error fetching the user!"})
    }     
}