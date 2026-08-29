import { useState, useEffect } from "react";
import API from "../services/api";
import toast from "react-hot-toast";

export default function Users(){
    const [users, setUsers] = useState([]);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("user");
    const [password, setPassword] = useState("");

    const fetchUsers = async ()=>{
        const res = await API.get("/users");
        setUsers(res.data.users);
    };

    useEffect(()=>{
        let ignore = false;
        
        const load = async () =>{
            const res = await API.get("/users");

            if(!ignore){
                setUsers(res.data.users)
            }
        }
        
        load();
        return () =>{
            ignore=true;
        };
    },[]);
    
    
    const createUser = async () =>{
        if(!email || !password){
            toast.error("Email and password required");
            return;
        }

        try{
            await API.post("/users" ,{
                email,
                password,
                role
            });
            toast.success("User created");
            setEmail("")
            setPassword("");
            fetchUsers();
        } catch{
            toast.error("Failed to create user")
        }
    };

    return (
        <div>
            <h1 className="text-xl font-bold mb-4">Users</h1>

            <div className="flex gap-2 mb-4">
                    <input
                        placeholder="Email"
                        value={email}
                        onChange={(e)=>setEmail(e.target.value)}
                        className="border p-2"
                    />

                        <input
                        placeholder="password"
                        value={password}
                        onChange={(e)=>setPassword(e.target.value)}
                        className="border p-2"
                    />

                <select onChange={(e)=>setRole(e.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                </select>

                <button onClick={createUser}
                className="bg-green-600 text-white px-4">
                    Create User
                </button>
            </div>
            <div className="space-y-2">
                {users.map(u=>(
                <div key={u._id}>
                    {u.email} - {u.role}
                </div>
            ))}
            </div>  
        </div>
    );
}