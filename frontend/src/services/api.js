import axios from "axios";
import toast from "react-hot-toast";
import { AuthContext } from "../context/AuthContext";

const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL   
});

API.interceptors.request.use((config)=>{
    const token = localStorage.getItem("token");

    if(token){
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
},
    (error)=>Promise.reject(error)
);

API.interceptors.response.use(
    (response) =>response,
    (error)=>{
        const status = error.response?.status
        const url = error. config?.url;

        if(url.includes("/auth/login")){
            return Promise.reject(error);
        }

        if(status===401){
            toast.error("Session Expired! Try re-login.")
            localStorage.clear();   
            window.location.href = "/"
        }       

        if(status===403){   
            toast.error("You are not allowed to perform this action!")
        }

        if (status===500){
            toast.error("Server Error. Please try again later.")
        }
        return Promise.reject(error);
    }
)

export default API; 