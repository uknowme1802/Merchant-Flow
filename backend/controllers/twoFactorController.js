const {authenticator} = require("otplib");
const qrcode = require("qrcode");
const User= require("../models/User");

const ensureTwoFactorShape = (user) => {
    if(!user.twoFactor){
        user.twoFactor = { enabled: false, secret: null, tempSecret:null }
    }
    return user;
}

exports.status = async (req,res,next) => {
    try{
        const user= await User.findById(req.user.id);
        if(!user){
            return res.status(404).json({success:false, message: "User not found"});
        }
        ensureTwoFactorShape(user);
        res.json({success: true, enabled: !!user.twoFactor.enabled});
    } catch(err){
        next(err)
    }
};

exports.setup = async (req, res, next) => {
    try{
        const user = await User.findById(req.user.id);
        if(!user){
            return res.status(404).json({success:false, message: "User not found"});
        }

        ensureTwoFactorShape(user);

        if(user.twoFactor.enabled){
            return res.status(400).json({
                success: false,
                message: "Two Factor already Enabled!"
            })
        }
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, "MerchantFlow", secret);

        const qrCode = await qrcode.toDataURL(otpauth);

        user.twoFactor.tempSecret = secret;
        user.markModified("twoFactor");
        await user.save();

        res.json({
            success: true,
            qrCode,
            secret,
        })
    } catch(err){
        next(err);
    }
}

exports.enable = async (req, res, next) =>{
    try{
        const {token} = req.body;
        if(!token){
            return res.status(400).json({
                success: false,
                message: "Authentcation code required!"
            })
        }
        const user = await User.findById(req.user.id).select("+twoFactor.tempSecret");
        if (!user){
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        ensureTwoFactorShape(user);
        
        if(!user.twoFactor.tempSecret){
            return res.staus(400).json({
                success:false,
                message: "No authentication setup pending!"
            })
        }
        const isValid = authenticator.check(token, user.twoFactor.tempSecret);
        if(!isValid){
            return res.status(401).json({
                success: false,
                message: "Invalid Authentication code"
            })
        }
        user.twoFactor.secret = user.twoFactor.tempSecret;
        user.twoFactor.tempSecret = null;
        user.twoFactor.enabled = true;
        user.markModified("twoFactor");
        await user.save();

        res.json({
            success: true,
            message: "Two Factor authentication is setup!"
        })
    } catch(err){
        next(err);
    }
}

exports.disable = async (req,res,next)=>{
    try{
        const {token} = req.body;
        if(!token){
            return res.status(400).json({
                success: false,
                message: "Authentication is required!"
            })
        }
        const user = await User.findById(req.user.id).select("+twoFactor.secret");
        
        if(!user){
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        ensureTwoFactorShape(user);
        
        if(!user.twoFactor.enabled || !user.twoFactor.secret){
            return res.status(400).json({
                success: false,
                message: "Two Factor authentication is not enabled!"
            })
        }
        const isValid = authenticator.check(token, user.twoFactor.secret);
        if(!isValid){
            return res.status(401).json({
                success: false,
                message: "Invalid Authentication code!"
            })
        }
        user.twoFactor.enabled = false;
        user.twoFactor.secret = null;
        user.tempSecret = null;
        user.markModified("twoFactor");
        await user.save();

        res.json({
            success: true,
            message: "Authentication is disabled"
        })
    } catch(err){
        next(err);
    }
}