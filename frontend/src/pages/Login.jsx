import { useNavigate } from "react-router-dom"
import { useState, useContext } from "react"
import { AuthContext } from "../context/AuthContext"
import API from "../services/api"
import Button from "../components/ui/Button"
import toast from "react-hot-toast"
import { Eye, EyeClosed } from "lucide-react"

export default function Login(){

 const navigate = useNavigate()
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [showPassword, setShowPassword] = useState(false);

 const {login} = useContext(AuthContext);

 const handleLogin = async ()=>{

  if(!email|| !password){
    toast.error("Please enter the email and Password");
    return;
  }

  try{
    const res = await API.post("/auth/login",{
      email,
      password
    });

    const userData = {
      email: res.data.user.email,
      role: res.data.user.role
    };

    login(userData, res.data.token)
    toast.success("Login Successful!")

    navigate("/dashboard");
  } catch(error) {
    toast.error(error.response?.data?.message || "Login Failed");
    // console.error(error);
  }
 };

 return(

  <div className="flex items-center justify-center h-screen bg-gradient-to-r from-indigo-500 to-purple-600">

   <div className="bg-white p-10 rounded-xl shadow-xl w-96">

    <h2 className="text-2xl font-bold mb-6 text-center">
     MerchantFlow Login
    </h2>

    <input
      className="w-full mb-4 p-3 border rounded"
      placeholder="Email"
      onChange={(e)=> setEmail(e.target.value)}
    />
    <div className="relative w-full mb-4">
      <input
      className="w-full mb-4 p-3 border rounded"
      type={showPassword ? "text" : "password" }
      placeholder="Password"
      onChange={(e)=>setPassword(e.target.value)}
      />
      <span 
        onClick={()=> setShowPassword(!showPassword)}
        className="absolute right-3 top-3 cursor-pointer text-gray-500"
      >
        {showPassword ? <EyeClosed size={18} /> : <Eye size={18}/>}
      </span>
    </div>
    
    <Button onClick={handleLogin}
    className="w-full bg-indigo-600 text-white p-2 rounded"
    >
      Login
    </Button>

   </div>

  </div>

 )
}