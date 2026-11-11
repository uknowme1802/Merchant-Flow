import axios from "axios";
import toast from "react-hot-toast";

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

const isAuthUrl = (url) =>
    url?.includes("/auth/login") || url?.includes("auth/2fa/verify-login") || url?.includes("/auth/refresh");

const endSession = () => {
    toast.error("Session Expired! Try re-login.");
    localStorage.clear();
    window.location.href = "/";
};

// One refresh at a time: parallel 401s share the same request
let refreshPromise = null;

const refreshAccessToken = () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return Promise.reject(new Error("No refresh token"));

    if (!refreshPromise) {
        // Plain axios (not API) so this call skips the interceptors and cannot loop
        refreshPromise = axios
            .post(`${import.meta.env.VITE_API_URL}/auth/refresh`, { token: refreshToken })
            .then((res) => {
                localStorage.setItem("token", res.data.accessToken);
                return res.data.accessToken;
            })
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
};

API.interceptors.response.use(
    (response) =>response,
    async (error)=>{
        const status = error.response?.status
        const original = error.config;
        const url = original?.url;

        if(url?.includes("/auth/login") || url?.includes("auth/2fa/verify-login")){
            return Promise.reject(error);
        }

        if(status===401){
            // Try a silent refresh once before giving up on the session
            if(original && !original._retried && !isAuthUrl(url)){
                original._retried = true;
                try {
                    const newToken = await refreshAccessToken();
                    original.headers.Authorization = `Bearer ${newToken}`;
                    return API(original);
                } catch {
                    // fall through to end the session
                }
            }
            endSession();
            return Promise.reject(error);
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
