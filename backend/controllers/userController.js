const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.createUser = async (req, res)=>{
    try{
        const {email, password, role} = req.body;

        const hashdePassword = await bcrypt.hash(password,10)

        const user = new User({email, password: hashdePassword, role});
        await user.save();

        res.json(user);
    } catch (error){
        res.status(500).json({message:"Error creating user"});
    }   
}

exports.getUsers = async (req, res) =>{
    const users = await User.find();
    res.json(users);
}