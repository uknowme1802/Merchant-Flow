import { useState, useEffect } from "react";
import { AuthContext } from "./AuthContext";

export const AuthProvider = ({children}) => {

    const [user, setUser] = useState(()=>{
        try{
        const storedUser = localStorage.getItem("user");
        return storedUser?JSON.parse(storedUser):null
    } catch {
        return null;
    }
    });
    // const [loading, setLoading] = useState(true);

    

    // useEffect(() => {
    //     try{
    //         const storedUser = localStorage.getItem("user");

    //         if(storedUser){
    //             const parsedUser = JSON.parse(storedUser)
    //             setUser(parsedUser);
    //         }
    //     } catch(err){
    //         console.error("Error parsing user:", err);
    //         localStorage.removeItem("user");
    //     } finally{
    //         setLoading(false);
    //     }
    // }, []);

    const login = (userData, token) =>{
        localStorage.setItem("user", JSON.stringify(userData));
        localStorage.setItem("token", token);
        setUser(userData)
    };

    const logout = () =>{
        localStorage.clear();
        setUser(null);
        window.location.href = "/";
    };

    // if(loading) return null;

    return (
        <AuthContext.Provider value={{user, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
};